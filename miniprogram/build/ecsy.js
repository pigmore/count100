(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = global || self, (function () {
		var current = global.ECSY;
		var exports = global.ECSY = {};
		factory(exports);
		exports.noConflict = function () { global.ECSY = current; return exports; };
	}()));
}(this, (function (exports) { 'use strict';

	/**
	 * Return the name of a component
	 * @param {Component} Component
	 * @private
	 */

	/**
	 * Get a key from a list of components
	 * @param {Array(Component)} Components Array of components to generate the key
	 * @private
	 */
	function queryKey(Components) {
	  var ids = [];
	  for (var n = 0; n < Components.length; n++) {
	    var T = Components[n];

	    if (!componentRegistered(T)) {
	      throw new Error(`Tried to create a query with an unregistered component`);
	    }

	    if (typeof T === "object") {
	      var operator = T.operator === "not" ? "!" : T.operator;
	      ids.push(operator + T.Component._typeId);
	    } else {
	      ids.push(T._typeId);
	    }
	  }

	  return ids.sort().join("-");
	}

	// Detector for browser's "window"
	const hasWindow = typeof window !== "undefined";

	// performance.now() "polyfill"
	const now =
	  hasWindow && typeof window.performance !== "undefined"
	    ? performance.now.bind(performance)
	    : Date.now.bind(Date);

	function componentRegistered(T) {
	  return (
	    (typeof T === "object" && T.Component._typeId !== undefined) ||
	    (T.isComponent && T._typeId !== undefined)
	  );
	}

	class SystemManager {
	  constructor(world) {
	    this._systems = [];
	    this._executeSystems = []; // Systems that have `execute` method
	    this.world = world;
	    this.lastExecutedSystem = null;
	  }

	  registerSystem(SystemClass, attributes) {
	    if (!SystemClass.isSystem) {
	      throw new Error(
	        `System '${SystemClass.name}' does not extend 'System' class`
	      );
	    }

	    if (this.getSystem(SystemClass) !== undefined) {
	      console.warn(`System '${SystemClass.getName()}' already registered.`);
	      return this;
	    }

	    var system = new SystemClass(this.world, attributes);
	    if (system.init) system.init(attributes);
	    system.order = this._systems.length;
	    this._systems.push(system);
	    if (system.execute) {
	      this._executeSystems.push(system);
	      this.sortSystems();
	    }
	    return this;
	  }

	  unregisterSystem(SystemClass) {
	    let system = this.getSystem(SystemClass);
	    if (system === undefined) {
	      console.warn(
	        `Can unregister system '${SystemClass.getName()}'. It doesn't exist.`
	      );
	      return this;
	    }

	    this._systems.splice(this._systems.indexOf(system), 1);

	    if (system.execute) {
	      this._executeSystems.splice(this._executeSystems.indexOf(system), 1);
	    }

	    // @todo Add system.unregister() call to free resources
	    return this;
	  }

	  sortSystems() {
	    this._executeSystems.sort((a, b) => {
	      return a.priority - b.priority || a.order - b.order;
	    });
	  }

	  getSystem(SystemClass) {
	    return this._systems.find((s) => s instanceof SystemClass);
	  }

	  getSystems() {
	    return this._systems;
	  }

	  removeSystem(SystemClass) {
	    var index = this._systems.indexOf(SystemClass);
	    if (!~index) return;

	    this._systems.splice(index, 1);
	  }

	  executeSystem(system, delta, time) {
	    if (system.initialized) {
	      if (system.canExecute()) {
	        let startTime = now();
	        system.execute(delta, time);
	        system.executeTime = now() - startTime;
	        this.lastExecutedSystem = system;
	        system.clearEvents();
	      }
	    }
	  }

	  stop() {
	    this._executeSystems.forEach((system) => system.stop());
	  }

	  execute(delta, time, forcePlay) {
	    this._executeSystems.forEach(
	      (system) =>
	        (forcePlay || system.enabled) && this.executeSystem(system, delta, time)
	    );
	  }

	  stats() {
	    var stats = {
	      numSystems: this._systems.length,
	      systems: {},
	    };

	    for (var i = 0; i < this._systems.length; i++) {
	      var system = this._systems[i];
	      var systemStats = (stats.systems[system.getName()] = {
	        queries: {},
	        executeTime: system.executeTime,
	      });
	      for (var name in system.ctx) {
	        systemStats.queries[name] = system.ctx[name].stats();
	      }
	    }

	    return stats;
	  }
	}

	class ObjectPool {
	  // @todo Add initial size
	  constructor(T, initialSize) {
	    this.freeList = [];
	    this.count = 0;
	    this.T = T;
	    this.isObjectPool = true;

	    if (typeof initialSize !== "undefined") {
	      this.expand(initialSize);
	    }
	  }

	  acquire() {
	    // Grow the list by 20%ish if we're out
	    if (this.freeList.length <= 0) {
	      this.expand(Math.round(this.count * 0.2) + 1);
	    }

	    var item = this.freeList.pop();

	    return item;
	  }

	  release(item) {
	    item.reset();
	    this.freeList.push(item);
	  }

	  expand(count) {
	    for (var n = 0; n < count; n++) {
	      var clone = new this.T();
	      clone._pool = this;
	      this.freeList.push(clone);
	    }
	    this.count += count;
	  }

	  totalSize() {
	    return this.count;
	  }

	  totalFree() {
	    return this.freeList.length;
	  }

	  totalUsed() {
	    return this.count - this.freeList.length;
	  }
	}

	/**
	 * @private
	 * @class EventDispatcher
	 */
	class EventDispatcher {
	  constructor() {
	    this._listeners = {};
	    this.stats = {
	      fired: 0,
	      handled: 0,
	    };
	  }

	  /**
	   * Add an event listener
	   * @param {String} eventName Name of the event to listen
	   * @param {Function} listener Callback to trigger when the event is fired
	   */
	  addEventListener(eventName, listener) {
	    let listeners = this._listeners;
	    if (listeners[eventName] === undefined) {
	      listeners[eventName] = [];
	    }

	    if (listeners[eventName].indexOf(listener) === -1) {
	      listeners[eventName].push(listener);
	    }
	  }

	  /**
	   * Check if an event listener is already added to the list of listeners
	   * @param {String} eventName Name of the event to check
	   * @param {Function} listener Callback for the specified event
	   */
	  hasEventListener(eventName, listener) {
	    return (
	      this._listeners[eventName] !== undefined &&
	      this._listeners[eventName].indexOf(listener) !== -1
	    );
	  }

	  /**
	   * Remove an event listener
	   * @param {String} eventName Name of the event to remove
	   * @param {Function} listener Callback for the specified event
	   */
	  removeEventListener(eventName, listener) {
	    var listenerArray = this._listeners[eventName];
	    if (listenerArray !== undefined) {
	      var index = listenerArray.indexOf(listener);
	      if (index !== -1) {
	        listenerArray.splice(index, 1);
	      }
	    }
	  }

	  /**
	   * Dispatch an event
	   * @param {String} eventName Name of the event to dispatch
	   * @param {Entity} entity (Optional) Entity to emit
	   * @param {Component} component
	   */
	  dispatchEvent(eventName, entity, component) {
	    this.stats.fired++;

	    var listenerArray = this._listeners[eventName];
	    if (listenerArray !== undefined) {
	      var array = listenerArray.slice(0);

	      for (var i = 0; i < array.length; i++) {
	        array[i].call(this, entity, component);
	      }
	    }
	  }

	  /**
	   * Reset stats counters
	   */
	  resetCounters() {
	    this.stats.fired = this.stats.handled = 0;
	  }
	}

	class Query {
	  /**
	   * @param {Array(Component)} Components List of types of components to query
	   */
	  constructor(Components, manager) {
	    this.Components = [];
	    this.NotComponents = [];

	    Components.forEach((component) => {
	      if (typeof component === "object") {
	        this.NotComponents.push(component.Component);
	      } else {
	        this.Components.push(component);
	      }
	    });

	    if (this.Components.length === 0) {
	      throw new Error("Can't create a query without components");
	    }

	    this.entities = [];

	    this.eventDispatcher = new EventDispatcher();

	    // This query is being used by a reactive system
	    this.reactive = false;

	    this.key = queryKey(Components);

	    // Fill the query with the existing entities
	    for (var i = 0; i < manager._entities.length; i++) {
	      var entity = manager._entities[i];
	      if (this.match(entity)) {
	        // @todo ??? this.addEntity(entity); => preventing the event to be generated
	        entity.queries.push(this);
	        this.entities.push(entity);
	      }
	    }
	  }

	  /**
	   * Add entity to this query
	   * @param {Entity} entity
	   */
	  addEntity(entity) {
	    entity.queries.push(this);
	    this.entities.push(entity);

	    this.eventDispatcher.dispatchEvent(Query.prototype.ENTITY_ADDED, entity);
	  }

	  /**
	   * Remove entity from this query
	   * @param {Entity} entity
	   */
	  removeEntity(entity) {
	    let index = this.entities.indexOf(entity);
	    if (~index) {
	      this.entities.splice(index, 1);

	      index = entity.queries.indexOf(this);
	      entity.queries.splice(index, 1);

	      this.eventDispatcher.dispatchEvent(
	        Query.prototype.ENTITY_REMOVED,
	        entity
	      );
	    }
	  }

	  match(entity) {
	    return (
	      entity.hasAllComponents(this.Components) &&
	      !entity.hasAnyComponents(this.NotComponents)
	    );
	  }

	  toJSON() {
	    return {
	      key: this.key,
	      reactive: this.reactive,
	      components: {
	        included: this.Components.map((C) => C.name),
	        not: this.NotComponents.map((C) => C.name),
	      },
	      numEntities: this.entities.length,
	    };
	  }

	  /**
	   * Return stats for this query
	   */
	  stats() {
	    return {
	      numComponents: this.Components.length,
	      numEntities: this.entities.length,
	    };
	  }
	}

	Query.prototype.ENTITY_ADDED = "Query#ENTITY_ADDED";
	Query.prototype.ENTITY_REMOVED = "Query#ENTITY_REMOVED";
	Query.prototype.COMPONENT_CHANGED = "Query#COMPONENT_CHANGED";

	/**
	 * @private
	 * @class QueryManager
	 */
	class QueryManager {
	  constructor(world) {
	    this._world = world;

	    // Queries indexed by a unique identifier for the components it has
	    this._queries = {};
	  }

	  onEntityRemoved(entity) {
	    for (var queryName in this._queries) {
	      var query = this._queries[queryName];
	      if (entity.queries.indexOf(query) !== -1) {
	        query.removeEntity(entity);
	      }
	    }
	  }

	  /**
	   * Callback when a component is added to an entity
	   * @param {Entity} entity Entity that just got the new component
	   * @param {Component} Component Component added to the entity
	   */
	  onEntityComponentAdded(entity, Component) {
	    // @todo Use bitmask for checking components?

	    // Check each indexed query to see if we need to add this entity to the list
	    for (var queryName in this._queries) {
	      var query = this._queries[queryName];

	      if (
	        !!~query.NotComponents.indexOf(Component) &&
	        ~query.entities.indexOf(entity)
	      ) {
	        query.removeEntity(entity);
	        continue;
	      }

	      // Add the entity only if:
	      // Component is in the query
	      // and Entity has ALL the components of the query
	      // and Entity is not already in the query
	      if (
	        !~query.Components.indexOf(Component) ||
	        !query.match(entity) ||
	        ~query.entities.indexOf(entity)
	      )
	        continue;

	      query.addEntity(entity);
	    }
	  }

	  /**
	   * Callback when a component is removed from an entity
	   * @param {Entity} entity Entity to remove the component from
	   * @param {Component} Component Component to remove from the entity
	   */
	  onEntityComponentRemoved(entity, Component) {
	    for (var queryName in this._queries) {
	      var query = this._queries[queryName];

	      if (
	        !!~query.NotComponents.indexOf(Component) &&
	        !~query.entities.indexOf(entity) &&
	        query.match(entity)
	      ) {
	        query.addEntity(entity);
	        continue;
	      }

	      if (
	        !!~query.Components.indexOf(Component) &&
	        !!~query.entities.indexOf(entity) &&
	        !query.match(entity)
	      ) {
	        query.removeEntity(entity);
	        continue;
	      }
	    }
	  }

	  /**
	   * Get a query for the specified components
	   * @param {Component} Components Components that the query should have
	   */
	  getQuery(Components) {
	    var key = queryKey(Components);
	    var query = this._queries[key];
	    if (!query) {
	      this._queries[key] = query = new Query(Components, this._world);
	    }
	    return query;
	  }

	  /**
	   * Return some stats from this class
	   */
	  stats() {
	    var stats = {};
	    for (var queryName in this._queries) {
	      stats[queryName] = this._queries[queryName].stats();
	    }
	    return stats;
	  }
	}

	class Component {
	  constructor(props) {
	    if (props !== false) {
	      const schema = this.constructor.schema;

	      for (const key in schema) {
	        if (props && props.hasOwnProperty(key)) {
	          this[key] = props[key];
	        } else {
	          const schemaProp = schema[key];
	          if (schemaProp.hasOwnProperty("default")) {
	            this[key] = schemaProp.type.clone(schemaProp.default);
	          } else {
	            const type = schemaProp.type;
	            this[key] = type.clone(type.default);
	          }
	        }
	      }

	      if ( props !== undefined) {
	        this.checkUndefinedAttributes(props);
	      }
	    }

	    this._pool = null;
	  }

	  copy(source) {
	    const schema = this.constructor.schema;

	    for (const key in schema) {
	      const prop = schema[key];

	      if (source.hasOwnProperty(key)) {
	        this[key] = prop.type.copy(source[key], this[key]);
	      }
	    }

	    // @DEBUG
	    {
	      this.checkUndefinedAttributes(source);
	    }

	    return this;
	  }

	  clone() {
	    return new this.constructor().copy(this);
	  }

	  reset() {
	    const schema = this.constructor.schema;

	    for (const key in schema) {
	      const schemaProp = schema[key];

	      if (schemaProp.hasOwnProperty("default")) {
	        this[key] = schemaProp.type.copy(schemaProp.default, this[key]);
	      } else {
	        const type = schemaProp.type;
	        this[key] = type.copy(type.default, this[key]);
	      }
	    }
	  }

	  dispose() {
	    if (this._pool) {
	      this._pool.release(this);
	    }
	  }

	  getName() {
	    return this.constructor.getName();
	  }

	  checkUndefinedAttributes(src) {
	    const schema = this.constructor.schema;

	    // Check that the attributes defined in source are also defined in the schema
	    Object.keys(src).forEach((srcKey) => {
	      if (!schema.hasOwnProperty(srcKey)) {
	        console.warn(
	          `Trying to set attribute '${srcKey}' not defined in the '${this.constructor.name}' schema. Please fix the schema, the attribute value won't be set`
	        );
	      }
	    });
	  }
	}

	Component.schema = {};
	Component.isComponent = true;
	Component.getName = function () {
	  return this.displayName || this.name;
	};

	class SystemStateComponent extends Component {}

	SystemStateComponent.isSystemStateComponent = true;

	class EntityPool extends ObjectPool {
	  constructor(entityManager, entityClass, initialSize) {
	    super(entityClass, undefined);
	    this.entityManager = entityManager;

	    if (typeof initialSize !== "undefined") {
	      this.expand(initialSize);
	    }
	  }

	  expand(count) {
	    for (var n = 0; n < count; n++) {
	      var clone = new this.T(this.entityManager);
	      clone._pool = this;
	      this.freeList.push(clone);
	    }
	    this.count += count;
	  }
	}

	/**
	 * @private
	 * @class EntityManager
	 */
	class EntityManager {
	  constructor(world) {
	    this.world = world;
	    this.componentsManager = world.componentsManager;

	    // All the entities in this instance
	    this._entities = [];
	    this._nextEntityId = 0;

	    this._entitiesByNames = {};

	    this._queryManager = new QueryManager(this);
	    this.eventDispatcher = new EventDispatcher();
	    this._entityPool = new EntityPool(
	      this,
	      this.world.options.entityClass,
	      this.world.options.entityPoolSize
	    );

	    // Deferred deletion
	    this.entitiesWithComponentsToRemove = [];
	    this.entitiesToRemove = [];
	    this.deferredRemovalEnabled = true;
	  }

	  getEntityByName(name) {
	    return this._entitiesByNames[name];
	  }

	  /**
	   * Create a new entity
	   */
	  createEntity(name) {
	    var entity = this._entityPool.acquire();
	    entity.alive = true;
	    entity.name = name || "";
	    if (name) {
	      if (this._entitiesByNames[name]) {
	        console.warn(`Entity name '${name}' already exist`);
	      } else {
	        this._entitiesByNames[name] = entity;
	      }
	    }

	    this._entities.push(entity);
	    this.eventDispatcher.dispatchEvent(ENTITY_CREATED, entity);
	    return entity;
	  }

	  // COMPONENTS

	  /**
	   * Add a component to an entity
	   * @param {Entity} entity Entity where the component will be added
	   * @param {Component} Component Component to be added to the entity
	   * @param {Object} values Optional values to replace the default attributes
	   */
	  entityAddComponent(entity, Component, values) {
	    // @todo Probably define Component._typeId with a default value and avoid using typeof
	    if (
	      typeof Component._typeId === "undefined" &&
	      !this.world.componentsManager._ComponentsMap[Component._typeId]
	    ) {
	      throw new Error(
	        `Attempted to add unregistered component "${Component.getName()}"`
	      );
	    }

	    if (~entity._ComponentTypes.indexOf(Component)) {
	      {
	        console.warn(
	          "Component type already exists on entity.",
	          entity,
	          Component.getName()
	        );
	      }
	      return;
	    }

	    entity._ComponentTypes.push(Component);

	    if (Component.__proto__ === SystemStateComponent) {
	      entity.numStateComponents++;
	    }

	    var componentPool = this.world.componentsManager.getComponentsPool(
	      Component
	    );

	    var component = componentPool
	      ? componentPool.acquire()
	      : new Component(values);

	    if (componentPool && values) {
	      component.copy(values);
	    }

	    entity._components[Component._typeId] = component;

	    this._queryManager.onEntityComponentAdded(entity, Component);
	    this.world.componentsManager.componentAddedToEntity(Component);

	    this.eventDispatcher.dispatchEvent(COMPONENT_ADDED, entity, Component);
	  }

	  /**
	   * Remove a component from an entity
	   * @param {Entity} entity Entity which will get removed the component
	   * @param {*} Component Component to remove from the entity
	   * @param {Bool} immediately If you want to remove the component immediately instead of deferred (Default is false)
	   */
	  entityRemoveComponent(entity, Component, immediately) {
	    var index = entity._ComponentTypes.indexOf(Component);
	    if (!~index) return;

	    this.eventDispatcher.dispatchEvent(COMPONENT_REMOVE, entity, Component);

	    if (immediately) {
	      this._entityRemoveComponentSync(entity, Component, index);
	    } else {
	      if (entity._ComponentTypesToRemove.length === 0)
	        this.entitiesWithComponentsToRemove.push(entity);

	      entity._ComponentTypes.splice(index, 1);
	      entity._ComponentTypesToRemove.push(Component);

	      entity._componentsToRemove[Component._typeId] =
	        entity._components[Component._typeId];
	      delete entity._components[Component._typeId];
	    }

	    // Check each indexed query to see if we need to remove it
	    this._queryManager.onEntityComponentRemoved(entity, Component);

	    if (Component.__proto__ === SystemStateComponent) {
	      entity.numStateComponents--;

	      // Check if the entity was a ghost waiting for the last system state component to be removed
	      if (entity.numStateComponents === 0 && !entity.alive) {
	        entity.remove();
	      }
	    }
	  }

	  _entityRemoveComponentSync(entity, Component, index) {
	    // Remove T listing on entity and property ref, then free the component.
	    entity._ComponentTypes.splice(index, 1);
	    var component = entity._components[Component._typeId];
	    delete entity._components[Component._typeId];
	    component.dispose();
	    this.world.componentsManager.componentRemovedFromEntity(Component);
	  }

	  /**
	   * Remove all the components from an entity
	   * @param {Entity} entity Entity from which the components will be removed
	   */
	  entityRemoveAllComponents(entity, immediately) {
	    let Components = entity._ComponentTypes;

	    for (let j = Components.length - 1; j >= 0; j--) {
	      if (Components[j].__proto__ !== SystemStateComponent)
	        this.entityRemoveComponent(entity, Components[j], immediately);
	    }
	  }

	  /**
	   * Remove the entity from this manager. It will clear also its components
	   * @param {Entity} entity Entity to remove from the manager
	   * @param {Bool} immediately If you want to remove the component immediately instead of deferred (Default is false)
	   */
	  removeEntity(entity, immediately) {
	    var index = this._entities.indexOf(entity);

	    if (!~index) throw new Error("Tried to remove entity not in list");

	    entity.alive = false;
	    this.entityRemoveAllComponents(entity, immediately);

	    if (entity.numStateComponents === 0) {
	      // Remove from entity list
	      this.eventDispatcher.dispatchEvent(ENTITY_REMOVED, entity);
	      this._queryManager.onEntityRemoved(entity);
	      if (immediately === true) {
	        this._releaseEntity(entity, index);
	      } else {
	        this.entitiesToRemove.push(entity);
	      }
	    }
	  }

	  _releaseEntity(entity, index) {
	    this._entities.splice(index, 1);

	    if (this._entitiesByNames[entity.name]) {
	      delete this._entitiesByNames[entity.name];
	    }
	    entity._pool.release(entity);
	  }

	  /**
	   * Remove all entities from this manager
	   */
	  removeAllEntities() {
	    for (var i = this._entities.length - 1; i >= 0; i--) {
	      this.removeEntity(this._entities[i]);
	    }
	  }

	  processDeferredRemoval() {
	    if (!this.deferredRemovalEnabled) {
	      return;
	    }

	    for (let i = 0; i < this.entitiesToRemove.length; i++) {
	      let entity = this.entitiesToRemove[i];
	      let index = this._entities.indexOf(entity);
	      this._releaseEntity(entity, index);
	    }
	    this.entitiesToRemove.length = 0;

	    for (let i = 0; i < this.entitiesWithComponentsToRemove.length; i++) {
	      let entity = this.entitiesWithComponentsToRemove[i];
	      while (entity._ComponentTypesToRemove.length > 0) {
	        let Component = entity._ComponentTypesToRemove.pop();

	        var component = entity._componentsToRemove[Component._typeId];
	        delete entity._componentsToRemove[Component._typeId];
	        component.dispose();
	        this.world.componentsManager.componentRemovedFromEntity(Component);

	        //this._entityRemoveComponentSync(entity, Component, index);
	      }
	    }

	    this.entitiesWithComponentsToRemove.length = 0;
	  }

	  /**
	   * Get a query based on a list of components
	   * @param {Array(Component)} Components List of components that will form the query
	   */
	  queryComponents(Components) {
	    return this._queryManager.getQuery(Components);
	  }

	  // EXTRAS

	  /**
	   * Return number of entities
	   */
	  count() {
	    return this._entities.length;
	  }

	  /**
	   * Return some stats
	   */
	  stats() {
	    var stats = {
	      numEntities: this._entities.length,
	      numQueries: Object.keys(this._queryManager._queries).length,
	      queries: this._queryManager.stats(),
	      numComponentPool: Object.keys(this.componentsManager._componentPool)
	        .length,
	      componentPool: {},
	      eventDispatcher: this.eventDispatcher.stats,
	    };

	    for (var ecsyComponentId in this.componentsManager._componentPool) {
	      var pool = this.componentsManager._componentPool[ecsyComponentId];
	      stats.componentPool[pool.T.getName()] = {
	        used: pool.totalUsed(),
	        size: pool.count,
	      };
	    }

	    return stats;
	  }
	}

	const ENTITY_CREATED = "EntityManager#ENTITY_CREATE";
	const ENTITY_REMOVED = "EntityManager#ENTITY_REMOVED";
	const COMPONENT_ADDED = "EntityManager#COMPONENT_ADDED";
	const COMPONENT_REMOVE = "EntityManager#COMPONENT_REMOVE";

	class ComponentManager {
	  constructor() {
	    this.Components = [];
	    this._ComponentsMap = {};

	    this._componentPool = {};
	    this.numComponents = {};
	    this.nextComponentId = 0;
	  }

	  hasComponent(Component) {
	    return this.Components.indexOf(Component) !== -1;
	  }

	  registerComponent(Component, objectPool) {
	    if (this.Components.indexOf(Component) !== -1) {
	      console.warn(
	        `Component type: '${Component.getName()}' already registered.`
	      );
	      return;
	    }

	    const schema = Component.schema;

	    if (!schema) {
	      throw new Error(
	        `Component "${Component.getName()}" has no schema property.`
	      );
	    }

	    for (const propName in schema) {
	      const prop = schema[propName];

	      if (!prop.type) {
	        throw new Error(
	          `Invalid schema for component "${Component.getName()}". Missing type for "${propName}" property.`
	        );
	      }
	    }

	    Component._typeId = this.nextComponentId++;
	    this.Components.push(Component);
	    this._ComponentsMap[Component._typeId] = Component;
	    this.numComponents[Component._typeId] = 0;

	    if (objectPool === undefined) {
	      objectPool = new ObjectPool(Component);
	    } else if (objectPool === false) {
	      objectPool = undefined;
	    }

	    this._componentPool[Component._typeId] = objectPool;
	  }

	  componentAddedToEntity(Component) {
	    this.numComponents[Component._typeId]++;
	  }

	  componentRemovedFromEntity(Component) {
	    this.numComponents[Component._typeId]--;
	  }

	  getComponentsPool(Component) {
	    return this._componentPool[Component._typeId];
	  }
	}

	const Version = "0.3.1";

	const proxyMap = new WeakMap();

	const proxyHandler = {
	  set(target, prop) {
	    throw new Error(
	      `Tried to write to "${target.constructor.getName()}#${String(
        prop
      )}" on immutable component. Use .getMutableComponent() to modify a component.`
	    );
	  },
	};

	function wrapImmutableComponent(T, component) {
	  if (component === undefined) {
	    return undefined;
	  }

	  let wrappedComponent = proxyMap.get(component);

	  if (!wrappedComponent) {
	    wrappedComponent = new Proxy(component, proxyHandler);
	    proxyMap.set(component, wrappedComponent);
	  }

	  return wrappedComponent;
	}

	class Entity {
	  constructor(entityManager) {
	    this._entityManager = entityManager || null;

	    // Unique ID for this entity
	    this.id = entityManager._nextEntityId++;

	    // List of components types the entity has
	    this._ComponentTypes = [];

	    // Instance of the components
	    this._components = {};

	    this._componentsToRemove = {};

	    // Queries where the entity is added
	    this.queries = [];

	    // Used for deferred removal
	    this._ComponentTypesToRemove = [];

	    this.alive = false;

	    //if there are state components on a entity, it can't be removed completely
	    this.numStateComponents = 0;
	  }

	  // COMPONENTS

	  getComponent(Component, includeRemoved) {
	    var component = this._components[Component._typeId];

	    if (!component && includeRemoved === true) {
	      component = this._componentsToRemove[Component._typeId];
	    }

	    return  wrapImmutableComponent(Component, component)
	      ;
	  }

	  getRemovedComponent(Component) {
	    const component = this._componentsToRemove[Component._typeId];

	    return  wrapImmutableComponent(Component, component)
	      ;
	  }

	  getComponents() {
	    return this._components;
	  }

	  getComponentsToRemove() {
	    return this._componentsToRemove;
	  }

	  getComponentTypes() {
	    return this._ComponentTypes;
	  }

	  getMutableComponent(Component) {
	    var component = this._components[Component._typeId];

	    if (!component) {
	      return;
	    }

	    for (var i = 0; i < this.queries.length; i++) {
	      var query = this.queries[i];
	      // @todo accelerate this check. Maybe having query._Components as an object
	      // @todo add Not components
	      if (query.reactive && query.Components.indexOf(Component) !== -1) {
	        query.eventDispatcher.dispatchEvent(
	          Query.prototype.COMPONENT_CHANGED,
	          this,
	          component
	        );
	      }
	    }
	    return component;
	  }

	  addComponent(Component, values) {
	    this._entityManager.entityAddComponent(this, Component, values);
	    return this;
	  }

	  removeComponent(Component, forceImmediate) {
	    this._entityManager.entityRemoveComponent(this, Component, forceImmediate);
	    return this;
	  }

	  hasComponent(Component, includeRemoved) {
	    return (
	      !!~this._ComponentTypes.indexOf(Component) ||
	      (includeRemoved === true && this.hasRemovedComponent(Component))
	    );
	  }

	  hasRemovedComponent(Component) {
	    return !!~this._ComponentTypesToRemove.indexOf(Component);
	  }

	  hasAllComponents(Components) {
	    for (var i = 0; i < Components.length; i++) {
	      if (!this.hasComponent(Components[i])) return false;
	    }
	    return true;
	  }

	  hasAnyComponents(Components) {
	    for (var i = 0; i < Components.length; i++) {
	      if (this.hasComponent(Components[i])) return true;
	    }
	    return false;
	  }

	  removeAllComponents(forceImmediate) {
	    return this._entityManager.entityRemoveAllComponents(this, forceImmediate);
	  }

	  copy(src) {
	    // TODO: This can definitely be optimized
	    for (var ecsyComponentId in src._components) {
	      var srcComponent = src._components[ecsyComponentId];
	      this.addComponent(srcComponent.constructor);
	      var component = this.getComponent(srcComponent.constructor);
	      component.copy(srcComponent);
	    }

	    return this;
	  }

	  clone() {
	    return new Entity(this._entityManager).copy(this);
	  }

	  reset() {
	    this.id = this._entityManager._nextEntityId++;
	    this._ComponentTypes.length = 0;
	    this.queries.length = 0;

	    for (var ecsyComponentId in this._components) {
	      delete this._components[ecsyComponentId];
	    }
	  }

	  remove(forceImmediate) {
	    return this._entityManager.removeEntity(this, forceImmediate);
	  }
	}

	const DEFAULT_OPTIONS = {
	  entityPoolSize: 0,
	  entityClass: Entity,
	};

	class World {
	  constructor(options = {}) {
	    this.options = Object.assign({}, DEFAULT_OPTIONS, options);

	    this.componentsManager = new ComponentManager(this);
	    this.entityManager = new EntityManager(this);
	    this.systemManager = new SystemManager(this);

	    this.enabled = true;

	    this.eventQueues = {};

	    if (hasWindow && typeof CustomEvent !== "undefined") {
	      var event = new CustomEvent("ecsy-world-created", {
	        detail: { world: this, version: Version },
	      });
	      window.dispatchEvent(event);
	    }

	    this.lastTime = now() / 1000;
	  }

	  registerComponent(Component, objectPool) {
	    this.componentsManager.registerComponent(Component, objectPool);
	    return this;
	  }

	  registerSystem(System, attributes) {
	    this.systemManager.registerSystem(System, attributes);
	    return this;
	  }

	  hasRegisteredComponent(Component) {
	    return this.componentsManager.hasComponent(Component);
	  }

	  unregisterSystem(System) {
	    this.systemManager.unregisterSystem(System);
	    return this;
	  }

	  getSystem(SystemClass) {
	    return this.systemManager.getSystem(SystemClass);
	  }

	  getSystems() {
	    return this.systemManager.getSystems();
	  }

	  execute(delta, time) {
	    if (!delta) {
	      time = now() / 1000;
	      delta = time - this.lastTime;
	      this.lastTime = time;
	    }

	    if (this.enabled) {
	      this.systemManager.execute(delta, time);
	      this.entityManager.processDeferredRemoval();
	    }
	  }

	  stop() {
	    this.enabled = false;
	  }

	  play() {
	    this.enabled = true;
	  }

	  createEntity(name) {
	    return this.entityManager.createEntity(name);
	  }

	  stats() {
	    var stats = {
	      entities: this.entityManager.stats(),
	      system: this.systemManager.stats(),
	    };

	    return stats;
	  }
	}

	class System {
	  canExecute() {
	    if (this._mandatoryQueries.length === 0) return true;

	    for (let i = 0; i < this._mandatoryQueries.length; i++) {
	      var query = this._mandatoryQueries[i];
	      if (query.entities.length === 0) {
	        return false;
	      }
	    }

	    return true;
	  }

	  getName() {
	    return this.constructor.getName();
	  }

	  constructor(world, attributes) {
	    this.world = world;
	    this.enabled = true;

	    // @todo Better naming :)
	    this._queries = {};
	    this.queries = {};

	    this.priority = 0;

	    // Used for stats
	    this.executeTime = 0;

	    if (attributes && attributes.priority) {
	      this.priority = attributes.priority;
	    }

	    this._mandatoryQueries = [];

	    this.initialized = true;

	    if (this.constructor.queries) {
	      for (var queryName in this.constructor.queries) {
	        var queryConfig = this.constructor.queries[queryName];
	        var Components = queryConfig.components;
	        if (!Components || Components.length === 0) {
	          throw new Error("'components' attribute can't be empty in a query");
	        }

	        // Detect if the components have already been registered
	        let unregisteredComponents = Components.filter(
	          (Component) => !componentRegistered(Component)
	        );

	        if (unregisteredComponents.length > 0) {
	          throw new Error(
	            `Tried to create a query '${
              this.constructor.name
            }.${queryName}' with unregistered components: [${unregisteredComponents
              .map((c) => c.getName())
              .join(", ")}]`
	          );
	        }

	        var query = this.world.entityManager.queryComponents(Components);

	        this._queries[queryName] = query;
	        if (queryConfig.mandatory === true) {
	          this._mandatoryQueries.push(query);
	        }
	        this.queries[queryName] = {
	          results: query.entities,
	        };

	        // Reactive configuration added/removed/changed
	        var validEvents = ["added", "removed", "changed"];

	        const eventMapping = {
	          added: Query.prototype.ENTITY_ADDED,
	          removed: Query.prototype.ENTITY_REMOVED,
	          changed: Query.prototype.COMPONENT_CHANGED, // Query.prototype.ENTITY_CHANGED
	        };

	        if (queryConfig.listen) {
	          validEvents.forEach((eventName) => {
	            if (!this.execute) {
	              console.warn(
	                `System '${this.getName()}' has defined listen events (${validEvents.join(
                  ", "
                )}) for query '${queryName}' but it does not implement the 'execute' method.`
	              );
	            }

	            // Is the event enabled on this system's query?
	            if (queryConfig.listen[eventName]) {
	              let event = queryConfig.listen[eventName];

	              if (eventName === "changed") {
	                query.reactive = true;
	                if (event === true) {
	                  // Any change on the entity from the components in the query
	                  let eventList = (this.queries[queryName][eventName] = []);
	                  query.eventDispatcher.addEventListener(
	                    Query.prototype.COMPONENT_CHANGED,
	                    (entity) => {
	                      // Avoid duplicates
	                      if (eventList.indexOf(entity) === -1) {
	                        eventList.push(entity);
	                      }
	                    }
	                  );
	                } else if (Array.isArray(event)) {
	                  let eventList = (this.queries[queryName][eventName] = []);
	                  query.eventDispatcher.addEventListener(
	                    Query.prototype.COMPONENT_CHANGED,
	                    (entity, changedComponent) => {
	                      // Avoid duplicates
	                      if (
	                        event.indexOf(changedComponent.constructor) !== -1 &&
	                        eventList.indexOf(entity) === -1
	                      ) {
	                        eventList.push(entity);
	                      }
	                    }
	                  );
	                }
	              } else {
	                let eventList = (this.queries[queryName][eventName] = []);

	                query.eventDispatcher.addEventListener(
	                  eventMapping[eventName],
	                  (entity) => {
	                    // @fixme overhead?
	                    if (eventList.indexOf(entity) === -1)
	                      eventList.push(entity);
	                  }
	                );
	              }
	            }
	          });
	        }
	      }
	    }
	  }

	  stop() {
	    this.executeTime = 0;
	    this.enabled = false;
	  }

	  play() {
	    this.enabled = true;
	  }

	  // @question rename to clear queues?
	  clearEvents() {
	    for (let queryName in this.queries) {
	      var query = this.queries[queryName];
	      if (query.added) {
	        query.added.length = 0;
	      }
	      if (query.removed) {
	        query.removed.length = 0;
	      }
	      if (query.changed) {
	        if (Array.isArray(query.changed)) {
	          query.changed.length = 0;
	        } else {
	          for (let name in query.changed) {
	            query.changed[name].length = 0;
	          }
	        }
	      }
	    }
	  }

	  toJSON() {
	    var json = {
	      name: this.getName(),
	      enabled: this.enabled,
	      executeTime: this.executeTime,
	      priority: this.priority,
	      queries: {},
	    };

	    if (this.constructor.queries) {
	      var queries = this.constructor.queries;
	      for (let queryName in queries) {
	        let query = this.queries[queryName];
	        let queryDefinition = queries[queryName];
	        let jsonQuery = (json.queries[queryName] = {
	          key: this._queries[queryName].key,
	        });

	        jsonQuery.mandatory = queryDefinition.mandatory === true;
	        jsonQuery.reactive =
	          queryDefinition.listen &&
	          (queryDefinition.listen.added === true ||
	            queryDefinition.listen.removed === true ||
	            queryDefinition.listen.changed === true ||
	            Array.isArray(queryDefinition.listen.changed));

	        if (jsonQuery.reactive) {
	          jsonQuery.listen = {};

	          const methods = ["added", "removed", "changed"];
	          methods.forEach((method) => {
	            if (query[method]) {
	              jsonQuery.listen[method] = {
	                entities: query[method].length,
	              };
	            }
	          });
	        }
	      }
	    }

	    return json;
	  }
	}

	System.isSystem = true;
	System.getName = function () {
	  return this.displayName || this.name;
	};

	function Not(Component) {
	  return {
	    operator: "not",
	    Component: Component,
	  };
	}

	class TagComponent extends Component {
	  constructor() {
	    super(false);
	  }
	}

	TagComponent.isTagComponent = true;

	const copyValue = (src) => src;

	const cloneValue = (src) => src;

	const copyArray = (src, dest) => {
	  if (!src) {
	    return src;
	  }

	  if (!dest) {
	    return src.slice();
	  }

	  dest.length = 0;

	  for (let i = 0; i < src.length; i++) {
	    dest.push(src[i]);
	  }

	  return dest;
	};

	const cloneArray = (src) => src && src.slice();

	const copyJSON = (src) => JSON.parse(JSON.stringify(src));

	const cloneJSON = (src) => JSON.parse(JSON.stringify(src));

	const copyCopyable = (src, dest) => {
	  if (!src) {
	    return src;
	  }

	  if (!dest) {
	    return src.clone();
	  }

	  return dest.copy(src);
	};

	const cloneClonable = (src) => src && src.clone();

	function createType(typeDefinition) {
	  var mandatoryProperties = ["name", "default", "copy", "clone"];

	  var undefinedProperties = mandatoryProperties.filter((p) => {
	    return !typeDefinition.hasOwnProperty(p);
	  });

	  if (undefinedProperties.length > 0) {
	    throw new Error(
	      `createType expects a type definition with the following properties: ${undefinedProperties.join(
        ", "
      )}`
	    );
	  }

	  typeDefinition.isType = true;

	  return typeDefinition;
	}

	/**
	 * Standard types
	 */
	const Types = {
	  Number: createType({
	    name: "Number",
	    default: 0,
	    copy: copyValue,
	    clone: cloneValue,
	  }),

	  Boolean: createType({
	    name: "Boolean",
	    default: false,
	    copy: copyValue,
	    clone: cloneValue,
	  }),

	  String: createType({
	    name: "String",
	    default: "",
	    copy: copyValue,
	    clone: cloneValue,
	  }),

	  Array: createType({
	    name: "Array",
	    default: [],
	    copy: copyArray,
	    clone: cloneArray,
	  }),

	  Ref: createType({
	    name: "Ref",
	    default: undefined,
	    copy: copyValue,
	    clone: cloneValue,
	  }),

	  JSON: createType({
	    name: "JSON",
	    default: null,
	    copy: copyJSON,
	    clone: cloneJSON,
	  }),
	};

	function generateId(length) {
	  var result = "";
	  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	  var charactersLength = characters.length;
	  for (var i = 0; i < length; i++) {
	    result += characters.charAt(Math.floor(Math.random() * charactersLength));
	  }
	  return result;
	}

	function injectScript(src, onLoad) {
	  var script = document.createElement("script");
	  // @todo Use link to the ecsy-devtools repo?
	  script.src = src;
	  script.onload = onLoad;
	  (document.head || document.documentElement).appendChild(script);
	}

	/* global Peer */

	function hookConsoleAndErrors(connection) {
	  var wrapFunctions = ["error", "warning", "log"];
	  wrapFunctions.forEach((key) => {
	    if (typeof console[key] === "function") {
	      var fn = console[key].bind(console);
	      console[key] = (...args) => {
	        connection.send({
	          method: "console",
	          type: key,
	          args: JSON.stringify(args),
	        });
	        return fn.apply(null, args);
	      };
	    }
	  });

	  window.addEventListener("error", (error) => {
	    connection.send({
	      method: "error",
	      error: JSON.stringify({
	        message: error.error.message,
	        stack: error.error.stack,
	      }),
	    });
	  });
	}

	function includeRemoteIdHTML(remoteId) {
	  let infoDiv = document.createElement("div");
	  infoDiv.style.cssText = `
    align-items: center;
    background-color: #333;
    color: #aaa;
    display:flex;
    font-family: Arial;
    font-size: 1.1em;
    height: 40px;
    justify-content: center;
    left: 0;
    opacity: 0.9;
    position: absolute;
    right: 0;
    text-align: center;
    top: 0;
  `;

	  infoDiv.innerHTML = `Open ECSY devtools to connect to this page using the code:&nbsp;<b style="color: #fff">${remoteId}</b>&nbsp;<button onClick="generateNewCode()">Generate new code</button>`;
	  document.body.appendChild(infoDiv);

	  return infoDiv;
	}

	function enableRemoteDevtools(remoteId) {
	  if (!hasWindow) {
	    console.warn("Remote devtools not available outside the browser");
	    return;
	  }

	  window.generateNewCode = () => {
	    window.localStorage.clear();
	    remoteId = generateId(6);
	    window.localStorage.setItem("ecsyRemoteId", remoteId);
	    window.location.reload(false);
	  };

	  remoteId = remoteId || window.localStorage.getItem("ecsyRemoteId");
	  if (!remoteId) {
	    remoteId = generateId(6);
	    window.localStorage.setItem("ecsyRemoteId", remoteId);
	  }

	  let infoDiv = includeRemoteIdHTML(remoteId);

	  window.__ECSY_REMOTE_DEVTOOLS_INJECTED = true;
	  window.__ECSY_REMOTE_DEVTOOLS = {};

	  let Version = "";

	  // This is used to collect the worlds created before the communication is being established
	  let worldsBeforeLoading = [];
	  let onWorldCreated = (e) => {
	    var world = e.detail.world;
	    Version = e.detail.version;
	    worldsBeforeLoading.push(world);
	  };
	  window.addEventListener("ecsy-world-created", onWorldCreated);

	  let onLoaded = () => {
	    // var peer = new Peer(remoteId);
	    var peer = new Peer(remoteId, {
	      host: "peerjs.ecsy.io",
	      secure: true,
	      port: 443,
	      config: {
	        iceServers: [
	          { url: "stun:stun.l.google.com:19302" },
	          { url: "stun:stun1.l.google.com:19302" },
	          { url: "stun:stun2.l.google.com:19302" },
	          { url: "stun:stun3.l.google.com:19302" },
	          { url: "stun:stun4.l.google.com:19302" },
	        ],
	      },
	      debug: 3,
	    });

	    peer.on("open", (/* id */) => {
	      peer.on("connection", (connection) => {
	        window.__ECSY_REMOTE_DEVTOOLS.connection = connection;
	        connection.on("open", function () {
	          // infoDiv.style.visibility = "hidden";
	          infoDiv.innerHTML = "Connected";

	          // Receive messages
	          connection.on("data", function (data) {
	            if (data.type === "init") {
	              var script = document.createElement("script");
	              script.setAttribute("type", "text/javascript");
	              script.onload = () => {
	                script.parentNode.removeChild(script);

	                // Once the script is injected we don't need to listen
	                window.removeEventListener(
	                  "ecsy-world-created",
	                  onWorldCreated
	                );
	                worldsBeforeLoading.forEach((world) => {
	                  var event = new CustomEvent("ecsy-world-created", {
	                    detail: { world: world, version: Version },
	                  });
	                  window.dispatchEvent(event);
	                });
	              };
	              script.innerHTML = data.script;
	              (document.head || document.documentElement).appendChild(script);
	              script.onload();

	              hookConsoleAndErrors(connection);
	            } else if (data.type === "executeScript") {
	              let value = eval(data.script);
	              if (data.returnEval) {
	                connection.send({
	                  method: "evalReturn",
	                  value: value,
	                });
	              }
	            }
	          });
	        });
	      });
	    });
	  };

	  // Inject PeerJS script
	  injectScript(
	    "https://cdn.jsdelivr.net/npm/peerjs@0.3.20/dist/peer.min.js",
	    onLoaded
	  );
	}

	if (hasWindow) {
	  const urlParams = new URLSearchParams(window.location.search);

	  // @todo Provide a way to disable it if needed
	  if (urlParams.has("enable-remote-devtools")) {
	    enableRemoteDevtools();
	  }
	}

	exports.Component = Component;
	exports.Not = Not;
	exports.ObjectPool = ObjectPool;
	exports.System = System;
	exports.SystemStateComponent = SystemStateComponent;
	exports.TagComponent = TagComponent;
	exports.Types = Types;
	exports.Version = Version;
	exports.World = World;
	exports._Entity = Entity;
	exports.cloneArray = cloneArray;
	exports.cloneClonable = cloneClonable;
	exports.cloneJSON = cloneJSON;
	exports.cloneValue = cloneValue;
	exports.copyArray = copyArray;
	exports.copyCopyable = copyCopyable;
	exports.copyJSON = copyJSON;
	exports.copyValue = copyValue;
	exports.createType = createType;
	exports.enableRemoteDevtools = enableRemoteDevtools;

	Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNzeS5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL1V0aWxzLmpzIiwiLi4vc3JjL1N5c3RlbU1hbmFnZXIuanMiLCIuLi9zcmMvT2JqZWN0UG9vbC5qcyIsIi4uL3NyYy9FdmVudERpc3BhdGNoZXIuanMiLCIuLi9zcmMvUXVlcnkuanMiLCIuLi9zcmMvUXVlcnlNYW5hZ2VyLmpzIiwiLi4vc3JjL0NvbXBvbmVudC5qcyIsIi4uL3NyYy9TeXN0ZW1TdGF0ZUNvbXBvbmVudC5qcyIsIi4uL3NyYy9FbnRpdHlNYW5hZ2VyLmpzIiwiLi4vc3JjL0NvbXBvbmVudE1hbmFnZXIuanMiLCIuLi9zcmMvVmVyc2lvbi5qcyIsIi4uL3NyYy9XcmFwSW1tdXRhYmxlQ29tcG9uZW50LmpzIiwiLi4vc3JjL0VudGl0eS5qcyIsIi4uL3NyYy9Xb3JsZC5qcyIsIi4uL3NyYy9TeXN0ZW0uanMiLCIuLi9zcmMvVGFnQ29tcG9uZW50LmpzIiwiLi4vc3JjL1R5cGVzLmpzIiwiLi4vc3JjL1JlbW90ZURldlRvb2xzL3V0aWxzLmpzIiwiLi4vc3JjL1JlbW90ZURldlRvb2xzL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUmV0dXJuIHRoZSBuYW1lIG9mIGEgY29tcG9uZW50XG4gKiBAcGFyYW0ge0NvbXBvbmVudH0gQ29tcG9uZW50XG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TmFtZShDb21wb25lbnQpIHtcbiAgcmV0dXJuIENvbXBvbmVudC5uYW1lO1xufVxuXG4vKipcbiAqIFJldHVybiBhIHZhbGlkIHByb3BlcnR5IG5hbWUgZm9yIHRoZSBDb21wb25lbnRcbiAqIEBwYXJhbSB7Q29tcG9uZW50fSBDb21wb25lbnRcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wb25lbnRQcm9wZXJ0eU5hbWUoQ29tcG9uZW50KSB7XG4gIHJldHVybiBnZXROYW1lKENvbXBvbmVudCk7XG59XG5cbi8qKlxuICogR2V0IGEga2V5IGZyb20gYSBsaXN0IG9mIGNvbXBvbmVudHNcbiAqIEBwYXJhbSB7QXJyYXkoQ29tcG9uZW50KX0gQ29tcG9uZW50cyBBcnJheSBvZiBjb21wb25lbnRzIHRvIGdlbmVyYXRlIHRoZSBrZXlcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWVyeUtleShDb21wb25lbnRzKSB7XG4gIHZhciBpZHMgPSBbXTtcbiAgZm9yICh2YXIgbiA9IDA7IG4gPCBDb21wb25lbnRzLmxlbmd0aDsgbisrKSB7XG4gICAgdmFyIFQgPSBDb21wb25lbnRzW25dO1xuXG4gICAgaWYgKCFjb21wb25lbnRSZWdpc3RlcmVkKFQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGNyZWF0ZSBhIHF1ZXJ5IHdpdGggYW4gdW5yZWdpc3RlcmVkIGNvbXBvbmVudGApO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgVCA9PT0gXCJvYmplY3RcIikge1xuICAgICAgdmFyIG9wZXJhdG9yID0gVC5vcGVyYXRvciA9PT0gXCJub3RcIiA/IFwiIVwiIDogVC5vcGVyYXRvcjtcbiAgICAgIGlkcy5wdXNoKG9wZXJhdG9yICsgVC5Db21wb25lbnQuX3R5cGVJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlkcy5wdXNoKFQuX3R5cGVJZCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGlkcy5zb3J0KCkuam9pbihcIi1cIik7XG59XG5cbi8vIERldGVjdG9yIGZvciBicm93c2VyJ3MgXCJ3aW5kb3dcIlxuZXhwb3J0IGNvbnN0IGhhc1dpbmRvdyA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCI7XG5cbi8vIHBlcmZvcm1hbmNlLm5vdygpIFwicG9seWZpbGxcIlxuZXhwb3J0IGNvbnN0IG5vdyA9XG4gIGhhc1dpbmRvdyAmJiB0eXBlb2Ygd2luZG93LnBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiXG4gICAgPyBwZXJmb3JtYW5jZS5ub3cuYmluZChwZXJmb3JtYW5jZSlcbiAgICA6IERhdGUubm93LmJpbmQoRGF0ZSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wb25lbnRSZWdpc3RlcmVkKFQpIHtcbiAgcmV0dXJuIChcbiAgICAodHlwZW9mIFQgPT09IFwib2JqZWN0XCIgJiYgVC5Db21wb25lbnQuX3R5cGVJZCAhPT0gdW5kZWZpbmVkKSB8fFxuICAgIChULmlzQ29tcG9uZW50ICYmIFQuX3R5cGVJZCAhPT0gdW5kZWZpbmVkKVxuICApO1xufVxuIiwiaW1wb3J0IHsgbm93IH0gZnJvbSBcIi4vVXRpbHMuanNcIjtcblxuZXhwb3J0IGNsYXNzIFN5c3RlbU1hbmFnZXIge1xuICBjb25zdHJ1Y3Rvcih3b3JsZCkge1xuICAgIHRoaXMuX3N5c3RlbXMgPSBbXTtcbiAgICB0aGlzLl9leGVjdXRlU3lzdGVtcyA9IFtdOyAvLyBTeXN0ZW1zIHRoYXQgaGF2ZSBgZXhlY3V0ZWAgbWV0aG9kXG4gICAgdGhpcy53b3JsZCA9IHdvcmxkO1xuICAgIHRoaXMubGFzdEV4ZWN1dGVkU3lzdGVtID0gbnVsbDtcbiAgfVxuXG4gIHJlZ2lzdGVyU3lzdGVtKFN5c3RlbUNsYXNzLCBhdHRyaWJ1dGVzKSB7XG4gICAgaWYgKCFTeXN0ZW1DbGFzcy5pc1N5c3RlbSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgU3lzdGVtICcke1N5c3RlbUNsYXNzLm5hbWV9JyBkb2VzIG5vdCBleHRlbmQgJ1N5c3RlbScgY2xhc3NgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmdldFN5c3RlbShTeXN0ZW1DbGFzcykgIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc29sZS53YXJuKGBTeXN0ZW0gJyR7U3lzdGVtQ2xhc3MuZ2V0TmFtZSgpfScgYWxyZWFkeSByZWdpc3RlcmVkLmApO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdmFyIHN5c3RlbSA9IG5ldyBTeXN0ZW1DbGFzcyh0aGlzLndvcmxkLCBhdHRyaWJ1dGVzKTtcbiAgICBpZiAoc3lzdGVtLmluaXQpIHN5c3RlbS5pbml0KGF0dHJpYnV0ZXMpO1xuICAgIHN5c3RlbS5vcmRlciA9IHRoaXMuX3N5c3RlbXMubGVuZ3RoO1xuICAgIHRoaXMuX3N5c3RlbXMucHVzaChzeXN0ZW0pO1xuICAgIGlmIChzeXN0ZW0uZXhlY3V0ZSkge1xuICAgICAgdGhpcy5fZXhlY3V0ZVN5c3RlbXMucHVzaChzeXN0ZW0pO1xuICAgICAgdGhpcy5zb3J0U3lzdGVtcygpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIHVucmVnaXN0ZXJTeXN0ZW0oU3lzdGVtQ2xhc3MpIHtcbiAgICBsZXQgc3lzdGVtID0gdGhpcy5nZXRTeXN0ZW0oU3lzdGVtQ2xhc3MpO1xuICAgIGlmIChzeXN0ZW0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgQ2FuIHVucmVnaXN0ZXIgc3lzdGVtICcke1N5c3RlbUNsYXNzLmdldE5hbWUoKX0nLiBJdCBkb2Vzbid0IGV4aXN0LmBcbiAgICAgICk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICB0aGlzLl9zeXN0ZW1zLnNwbGljZSh0aGlzLl9zeXN0ZW1zLmluZGV4T2Yoc3lzdGVtKSwgMSk7XG5cbiAgICBpZiAoc3lzdGVtLmV4ZWN1dGUpIHtcbiAgICAgIHRoaXMuX2V4ZWN1dGVTeXN0ZW1zLnNwbGljZSh0aGlzLl9leGVjdXRlU3lzdGVtcy5pbmRleE9mKHN5c3RlbSksIDEpO1xuICAgIH1cblxuICAgIC8vIEB0b2RvIEFkZCBzeXN0ZW0udW5yZWdpc3RlcigpIGNhbGwgdG8gZnJlZSByZXNvdXJjZXNcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIHNvcnRTeXN0ZW1zKCkge1xuICAgIHRoaXMuX2V4ZWN1dGVTeXN0ZW1zLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIHJldHVybiBhLnByaW9yaXR5IC0gYi5wcmlvcml0eSB8fCBhLm9yZGVyIC0gYi5vcmRlcjtcbiAgICB9KTtcbiAgfVxuXG4gIGdldFN5c3RlbShTeXN0ZW1DbGFzcykge1xuICAgIHJldHVybiB0aGlzLl9zeXN0ZW1zLmZpbmQoKHMpID0+IHMgaW5zdGFuY2VvZiBTeXN0ZW1DbGFzcyk7XG4gIH1cblxuICBnZXRTeXN0ZW1zKCkge1xuICAgIHJldHVybiB0aGlzLl9zeXN0ZW1zO1xuICB9XG5cbiAgcmVtb3ZlU3lzdGVtKFN5c3RlbUNsYXNzKSB7XG4gICAgdmFyIGluZGV4ID0gdGhpcy5fc3lzdGVtcy5pbmRleE9mKFN5c3RlbUNsYXNzKTtcbiAgICBpZiAoIX5pbmRleCkgcmV0dXJuO1xuXG4gICAgdGhpcy5fc3lzdGVtcy5zcGxpY2UoaW5kZXgsIDEpO1xuICB9XG5cbiAgZXhlY3V0ZVN5c3RlbShzeXN0ZW0sIGRlbHRhLCB0aW1lKSB7XG4gICAgaWYgKHN5c3RlbS5pbml0aWFsaXplZCkge1xuICAgICAgaWYgKHN5c3RlbS5jYW5FeGVjdXRlKCkpIHtcbiAgICAgICAgbGV0IHN0YXJ0VGltZSA9IG5vdygpO1xuICAgICAgICBzeXN0ZW0uZXhlY3V0ZShkZWx0YSwgdGltZSk7XG4gICAgICAgIHN5c3RlbS5leGVjdXRlVGltZSA9IG5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICB0aGlzLmxhc3RFeGVjdXRlZFN5c3RlbSA9IHN5c3RlbTtcbiAgICAgICAgc3lzdGVtLmNsZWFyRXZlbnRzKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0aGlzLl9leGVjdXRlU3lzdGVtcy5mb3JFYWNoKChzeXN0ZW0pID0+IHN5c3RlbS5zdG9wKCkpO1xuICB9XG5cbiAgZXhlY3V0ZShkZWx0YSwgdGltZSwgZm9yY2VQbGF5KSB7XG4gICAgdGhpcy5fZXhlY3V0ZVN5c3RlbXMuZm9yRWFjaChcbiAgICAgIChzeXN0ZW0pID0+XG4gICAgICAgIChmb3JjZVBsYXkgfHwgc3lzdGVtLmVuYWJsZWQpICYmIHRoaXMuZXhlY3V0ZVN5c3RlbShzeXN0ZW0sIGRlbHRhLCB0aW1lKVxuICAgICk7XG4gIH1cblxuICBzdGF0cygpIHtcbiAgICB2YXIgc3RhdHMgPSB7XG4gICAgICBudW1TeXN0ZW1zOiB0aGlzLl9zeXN0ZW1zLmxlbmd0aCxcbiAgICAgIHN5c3RlbXM6IHt9LFxuICAgIH07XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX3N5c3RlbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBzeXN0ZW0gPSB0aGlzLl9zeXN0ZW1zW2ldO1xuICAgICAgdmFyIHN5c3RlbVN0YXRzID0gKHN0YXRzLnN5c3RlbXNbc3lzdGVtLmdldE5hbWUoKV0gPSB7XG4gICAgICAgIHF1ZXJpZXM6IHt9LFxuICAgICAgICBleGVjdXRlVGltZTogc3lzdGVtLmV4ZWN1dGVUaW1lLFxuICAgICAgfSk7XG4gICAgICBmb3IgKHZhciBuYW1lIGluIHN5c3RlbS5jdHgpIHtcbiAgICAgICAgc3lzdGVtU3RhdHMucXVlcmllc1tuYW1lXSA9IHN5c3RlbS5jdHhbbmFtZV0uc3RhdHMoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gc3RhdHM7XG4gIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBPYmplY3RQb29sIHtcbiAgLy8gQHRvZG8gQWRkIGluaXRpYWwgc2l6ZVxuICBjb25zdHJ1Y3RvcihULCBpbml0aWFsU2l6ZSkge1xuICAgIHRoaXMuZnJlZUxpc3QgPSBbXTtcbiAgICB0aGlzLmNvdW50ID0gMDtcbiAgICB0aGlzLlQgPSBUO1xuICAgIHRoaXMuaXNPYmplY3RQb29sID0gdHJ1ZTtcblxuICAgIGlmICh0eXBlb2YgaW5pdGlhbFNpemUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRoaXMuZXhwYW5kKGluaXRpYWxTaXplKTtcbiAgICB9XG4gIH1cblxuICBhY3F1aXJlKCkge1xuICAgIC8vIEdyb3cgdGhlIGxpc3QgYnkgMjAlaXNoIGlmIHdlJ3JlIG91dFxuICAgIGlmICh0aGlzLmZyZWVMaXN0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICB0aGlzLmV4cGFuZChNYXRoLnJvdW5kKHRoaXMuY291bnQgKiAwLjIpICsgMSk7XG4gICAgfVxuXG4gICAgdmFyIGl0ZW0gPSB0aGlzLmZyZWVMaXN0LnBvcCgpO1xuXG4gICAgcmV0dXJuIGl0ZW07XG4gIH1cblxuICByZWxlYXNlKGl0ZW0pIHtcbiAgICBpdGVtLnJlc2V0KCk7XG4gICAgdGhpcy5mcmVlTGlzdC5wdXNoKGl0ZW0pO1xuICB9XG5cbiAgZXhwYW5kKGNvdW50KSB7XG4gICAgZm9yICh2YXIgbiA9IDA7IG4gPCBjb3VudDsgbisrKSB7XG4gICAgICB2YXIgY2xvbmUgPSBuZXcgdGhpcy5UKCk7XG4gICAgICBjbG9uZS5fcG9vbCA9IHRoaXM7XG4gICAgICB0aGlzLmZyZWVMaXN0LnB1c2goY2xvbmUpO1xuICAgIH1cbiAgICB0aGlzLmNvdW50ICs9IGNvdW50O1xuICB9XG5cbiAgdG90YWxTaXplKCkge1xuICAgIHJldHVybiB0aGlzLmNvdW50O1xuICB9XG5cbiAgdG90YWxGcmVlKCkge1xuICAgIHJldHVybiB0aGlzLmZyZWVMaXN0Lmxlbmd0aDtcbiAgfVxuXG4gIHRvdGFsVXNlZCgpIHtcbiAgICByZXR1cm4gdGhpcy5jb3VudCAtIHRoaXMuZnJlZUxpc3QubGVuZ3RoO1xuICB9XG59XG4iLCIvKipcbiAqIEBwcml2YXRlXG4gKiBAY2xhc3MgRXZlbnREaXNwYXRjaGVyXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEV2ZW50RGlzcGF0Y2hlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuX2xpc3RlbmVycyA9IHt9O1xuICAgIHRoaXMuc3RhdHMgPSB7XG4gICAgICBmaXJlZDogMCxcbiAgICAgIGhhbmRsZWQ6IDAsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYW4gZXZlbnQgbGlzdGVuZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byBsaXN0ZW5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgQ2FsbGJhY2sgdG8gdHJpZ2dlciB3aGVuIHRoZSBldmVudCBpcyBmaXJlZFxuICAgKi9cbiAgYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGxpc3RlbmVyKSB7XG4gICAgbGV0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycztcbiAgICBpZiAobGlzdGVuZXJzW2V2ZW50TmFtZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgbGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBbXTtcbiAgICB9XG5cbiAgICBpZiAobGlzdGVuZXJzW2V2ZW50TmFtZV0uaW5kZXhPZihsaXN0ZW5lcikgPT09IC0xKSB7XG4gICAgICBsaXN0ZW5lcnNbZXZlbnROYW1lXS5wdXNoKGxpc3RlbmVyKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYW4gZXZlbnQgbGlzdGVuZXIgaXMgYWxyZWFkeSBhZGRlZCB0byB0aGUgbGlzdCBvZiBsaXN0ZW5lcnNcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byBjaGVja1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBDYWxsYmFjayBmb3IgdGhlIHNwZWNpZmllZCBldmVudFxuICAgKi9cbiAgaGFzRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGxpc3RlbmVyKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2xpc3RlbmVyc1tldmVudE5hbWVdICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIHRoaXMuX2xpc3RlbmVyc1tldmVudE5hbWVdLmluZGV4T2YobGlzdGVuZXIpICE9PSAtMVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGFuIGV2ZW50IGxpc3RlbmVyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudE5hbWUgTmFtZSBvZiB0aGUgZXZlbnQgdG8gcmVtb3ZlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIENhbGxiYWNrIGZvciB0aGUgc3BlY2lmaWVkIGV2ZW50XG4gICAqL1xuICByZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgbGlzdGVuZXIpIHtcbiAgICB2YXIgbGlzdGVuZXJBcnJheSA9IHRoaXMuX2xpc3RlbmVyc1tldmVudE5hbWVdO1xuICAgIGlmIChsaXN0ZW5lckFycmF5ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHZhciBpbmRleCA9IGxpc3RlbmVyQXJyYXkuaW5kZXhPZihsaXN0ZW5lcik7XG4gICAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgIGxpc3RlbmVyQXJyYXkuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGlzcGF0Y2ggYW4gZXZlbnRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIHRoZSBldmVudCB0byBkaXNwYXRjaFxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5IChPcHRpb25hbCkgRW50aXR5IHRvIGVtaXRcbiAgICogQHBhcmFtIHtDb21wb25lbnR9IGNvbXBvbmVudFxuICAgKi9cbiAgZGlzcGF0Y2hFdmVudChldmVudE5hbWUsIGVudGl0eSwgY29tcG9uZW50KSB7XG4gICAgdGhpcy5zdGF0cy5maXJlZCsrO1xuXG4gICAgdmFyIGxpc3RlbmVyQXJyYXkgPSB0aGlzLl9saXN0ZW5lcnNbZXZlbnROYW1lXTtcbiAgICBpZiAobGlzdGVuZXJBcnJheSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB2YXIgYXJyYXkgPSBsaXN0ZW5lckFycmF5LnNsaWNlKDApO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldLmNhbGwodGhpcywgZW50aXR5LCBjb21wb25lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldCBzdGF0cyBjb3VudGVyc1xuICAgKi9cbiAgcmVzZXRDb3VudGVycygpIHtcbiAgICB0aGlzLnN0YXRzLmZpcmVkID0gdGhpcy5zdGF0cy5oYW5kbGVkID0gMDtcbiAgfVxufVxuIiwiaW1wb3J0IEV2ZW50RGlzcGF0Y2hlciBmcm9tIFwiLi9FdmVudERpc3BhdGNoZXIuanNcIjtcbmltcG9ydCB7IHF1ZXJ5S2V5IH0gZnJvbSBcIi4vVXRpbHMuanNcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUXVlcnkge1xuICAvKipcbiAgICogQHBhcmFtIHtBcnJheShDb21wb25lbnQpfSBDb21wb25lbnRzIExpc3Qgb2YgdHlwZXMgb2YgY29tcG9uZW50cyB0byBxdWVyeVxuICAgKi9cbiAgY29uc3RydWN0b3IoQ29tcG9uZW50cywgbWFuYWdlcikge1xuICAgIHRoaXMuQ29tcG9uZW50cyA9IFtdO1xuICAgIHRoaXMuTm90Q29tcG9uZW50cyA9IFtdO1xuXG4gICAgQ29tcG9uZW50cy5mb3JFYWNoKChjb21wb25lbnQpID0+IHtcbiAgICAgIGlmICh0eXBlb2YgY29tcG9uZW50ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHRoaXMuTm90Q29tcG9uZW50cy5wdXNoKGNvbXBvbmVudC5Db21wb25lbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5Db21wb25lbnRzLnB1c2goY29tcG9uZW50KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmICh0aGlzLkNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjcmVhdGUgYSBxdWVyeSB3aXRob3V0IGNvbXBvbmVudHNcIik7XG4gICAgfVxuXG4gICAgdGhpcy5lbnRpdGllcyA9IFtdO1xuXG4gICAgdGhpcy5ldmVudERpc3BhdGNoZXIgPSBuZXcgRXZlbnREaXNwYXRjaGVyKCk7XG5cbiAgICAvLyBUaGlzIHF1ZXJ5IGlzIGJlaW5nIHVzZWQgYnkgYSByZWFjdGl2ZSBzeXN0ZW1cbiAgICB0aGlzLnJlYWN0aXZlID0gZmFsc2U7XG5cbiAgICB0aGlzLmtleSA9IHF1ZXJ5S2V5KENvbXBvbmVudHMpO1xuXG4gICAgLy8gRmlsbCB0aGUgcXVlcnkgd2l0aCB0aGUgZXhpc3RpbmcgZW50aXRpZXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hbmFnZXIuX2VudGl0aWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZW50aXR5ID0gbWFuYWdlci5fZW50aXRpZXNbaV07XG4gICAgICBpZiAodGhpcy5tYXRjaChlbnRpdHkpKSB7XG4gICAgICAgIC8vIEB0b2RvID8/PyB0aGlzLmFkZEVudGl0eShlbnRpdHkpOyA9PiBwcmV2ZW50aW5nIHRoZSBldmVudCB0byBiZSBnZW5lcmF0ZWRcbiAgICAgICAgZW50aXR5LnF1ZXJpZXMucHVzaCh0aGlzKTtcbiAgICAgICAgdGhpcy5lbnRpdGllcy5wdXNoKGVudGl0eSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBlbnRpdHkgdG8gdGhpcyBxdWVyeVxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuICBhZGRFbnRpdHkoZW50aXR5KSB7XG4gICAgZW50aXR5LnF1ZXJpZXMucHVzaCh0aGlzKTtcbiAgICB0aGlzLmVudGl0aWVzLnB1c2goZW50aXR5KTtcblxuICAgIHRoaXMuZXZlbnREaXNwYXRjaGVyLmRpc3BhdGNoRXZlbnQoUXVlcnkucHJvdG90eXBlLkVOVElUWV9BRERFRCwgZW50aXR5KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgZW50aXR5IGZyb20gdGhpcyBxdWVyeVxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5XG4gICAqL1xuICByZW1vdmVFbnRpdHkoZW50aXR5KSB7XG4gICAgbGV0IGluZGV4ID0gdGhpcy5lbnRpdGllcy5pbmRleE9mKGVudGl0eSk7XG4gICAgaWYgKH5pbmRleCkge1xuICAgICAgdGhpcy5lbnRpdGllcy5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgICBpbmRleCA9IGVudGl0eS5xdWVyaWVzLmluZGV4T2YodGhpcyk7XG4gICAgICBlbnRpdHkucXVlcmllcy5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgICB0aGlzLmV2ZW50RGlzcGF0Y2hlci5kaXNwYXRjaEV2ZW50KFxuICAgICAgICBRdWVyeS5wcm90b3R5cGUuRU5USVRZX1JFTU9WRUQsXG4gICAgICAgIGVudGl0eVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBtYXRjaChlbnRpdHkpIHtcbiAgICByZXR1cm4gKFxuICAgICAgZW50aXR5Lmhhc0FsbENvbXBvbmVudHModGhpcy5Db21wb25lbnRzKSAmJlxuICAgICAgIWVudGl0eS5oYXNBbnlDb21wb25lbnRzKHRoaXMuTm90Q29tcG9uZW50cylcbiAgICApO1xuICB9XG5cbiAgdG9KU09OKCkge1xuICAgIHJldHVybiB7XG4gICAgICBrZXk6IHRoaXMua2V5LFxuICAgICAgcmVhY3RpdmU6IHRoaXMucmVhY3RpdmUsXG4gICAgICBjb21wb25lbnRzOiB7XG4gICAgICAgIGluY2x1ZGVkOiB0aGlzLkNvbXBvbmVudHMubWFwKChDKSA9PiBDLm5hbWUpLFxuICAgICAgICBub3Q6IHRoaXMuTm90Q29tcG9uZW50cy5tYXAoKEMpID0+IEMubmFtZSksXG4gICAgICB9LFxuICAgICAgbnVtRW50aXRpZXM6IHRoaXMuZW50aXRpZXMubGVuZ3RoLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIHN0YXRzIGZvciB0aGlzIHF1ZXJ5XG4gICAqL1xuICBzdGF0cygpIHtcbiAgICByZXR1cm4ge1xuICAgICAgbnVtQ29tcG9uZW50czogdGhpcy5Db21wb25lbnRzLmxlbmd0aCxcbiAgICAgIG51bUVudGl0aWVzOiB0aGlzLmVudGl0aWVzLmxlbmd0aCxcbiAgICB9O1xuICB9XG59XG5cblF1ZXJ5LnByb3RvdHlwZS5FTlRJVFlfQURERUQgPSBcIlF1ZXJ5I0VOVElUWV9BRERFRFwiO1xuUXVlcnkucHJvdG90eXBlLkVOVElUWV9SRU1PVkVEID0gXCJRdWVyeSNFTlRJVFlfUkVNT1ZFRFwiO1xuUXVlcnkucHJvdG90eXBlLkNPTVBPTkVOVF9DSEFOR0VEID0gXCJRdWVyeSNDT01QT05FTlRfQ0hBTkdFRFwiO1xuIiwiaW1wb3J0IFF1ZXJ5IGZyb20gXCIuL1F1ZXJ5LmpzXCI7XG5pbXBvcnQgeyBxdWVyeUtleSB9IGZyb20gXCIuL1V0aWxzLmpzXCI7XG5cbi8qKlxuICogQHByaXZhdGVcbiAqIEBjbGFzcyBRdWVyeU1hbmFnZXJcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUXVlcnlNYW5hZ2VyIHtcbiAgY29uc3RydWN0b3Iod29ybGQpIHtcbiAgICB0aGlzLl93b3JsZCA9IHdvcmxkO1xuXG4gICAgLy8gUXVlcmllcyBpbmRleGVkIGJ5IGEgdW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSBjb21wb25lbnRzIGl0IGhhc1xuICAgIHRoaXMuX3F1ZXJpZXMgPSB7fTtcbiAgfVxuXG4gIG9uRW50aXR5UmVtb3ZlZChlbnRpdHkpIHtcbiAgICBmb3IgKHZhciBxdWVyeU5hbWUgaW4gdGhpcy5fcXVlcmllcykge1xuICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcmllc1txdWVyeU5hbWVdO1xuICAgICAgaWYgKGVudGl0eS5xdWVyaWVzLmluZGV4T2YocXVlcnkpICE9PSAtMSkge1xuICAgICAgICBxdWVyeS5yZW1vdmVFbnRpdHkoZW50aXR5KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGJhY2sgd2hlbiBhIGNvbXBvbmVudCBpcyBhZGRlZCB0byBhbiBlbnRpdHlcbiAgICogQHBhcmFtIHtFbnRpdHl9IGVudGl0eSBFbnRpdHkgdGhhdCBqdXN0IGdvdCB0aGUgbmV3IGNvbXBvbmVudFxuICAgKiBAcGFyYW0ge0NvbXBvbmVudH0gQ29tcG9uZW50IENvbXBvbmVudCBhZGRlZCB0byB0aGUgZW50aXR5XG4gICAqL1xuICBvbkVudGl0eUNvbXBvbmVudEFkZGVkKGVudGl0eSwgQ29tcG9uZW50KSB7XG4gICAgLy8gQHRvZG8gVXNlIGJpdG1hc2sgZm9yIGNoZWNraW5nIGNvbXBvbmVudHM/XG5cbiAgICAvLyBDaGVjayBlYWNoIGluZGV4ZWQgcXVlcnkgdG8gc2VlIGlmIHdlIG5lZWQgdG8gYWRkIHRoaXMgZW50aXR5IHRvIHRoZSBsaXN0XG4gICAgZm9yICh2YXIgcXVlcnlOYW1lIGluIHRoaXMuX3F1ZXJpZXMpIHtcbiAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJpZXNbcXVlcnlOYW1lXTtcblxuICAgICAgaWYgKFxuICAgICAgICAhIX5xdWVyeS5Ob3RDb21wb25lbnRzLmluZGV4T2YoQ29tcG9uZW50KSAmJlxuICAgICAgICB+cXVlcnkuZW50aXRpZXMuaW5kZXhPZihlbnRpdHkpXG4gICAgICApIHtcbiAgICAgICAgcXVlcnkucmVtb3ZlRW50aXR5KGVudGl0eSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgdGhlIGVudGl0eSBvbmx5IGlmOlxuICAgICAgLy8gQ29tcG9uZW50IGlzIGluIHRoZSBxdWVyeVxuICAgICAgLy8gYW5kIEVudGl0eSBoYXMgQUxMIHRoZSBjb21wb25lbnRzIG9mIHRoZSBxdWVyeVxuICAgICAgLy8gYW5kIEVudGl0eSBpcyBub3QgYWxyZWFkeSBpbiB0aGUgcXVlcnlcbiAgICAgIGlmIChcbiAgICAgICAgIX5xdWVyeS5Db21wb25lbnRzLmluZGV4T2YoQ29tcG9uZW50KSB8fFxuICAgICAgICAhcXVlcnkubWF0Y2goZW50aXR5KSB8fFxuICAgICAgICB+cXVlcnkuZW50aXRpZXMuaW5kZXhPZihlbnRpdHkpXG4gICAgICApXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICBxdWVyeS5hZGRFbnRpdHkoZW50aXR5KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGJhY2sgd2hlbiBhIGNvbXBvbmVudCBpcyByZW1vdmVkIGZyb20gYW4gZW50aXR5XG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHkgRW50aXR5IHRvIHJlbW92ZSB0aGUgY29tcG9uZW50IGZyb21cbiAgICogQHBhcmFtIHtDb21wb25lbnR9IENvbXBvbmVudCBDb21wb25lbnQgdG8gcmVtb3ZlIGZyb20gdGhlIGVudGl0eVxuICAgKi9cbiAgb25FbnRpdHlDb21wb25lbnRSZW1vdmVkKGVudGl0eSwgQ29tcG9uZW50KSB7XG4gICAgZm9yICh2YXIgcXVlcnlOYW1lIGluIHRoaXMuX3F1ZXJpZXMpIHtcbiAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJpZXNbcXVlcnlOYW1lXTtcblxuICAgICAgaWYgKFxuICAgICAgICAhIX5xdWVyeS5Ob3RDb21wb25lbnRzLmluZGV4T2YoQ29tcG9uZW50KSAmJlxuICAgICAgICAhfnF1ZXJ5LmVudGl0aWVzLmluZGV4T2YoZW50aXR5KSAmJlxuICAgICAgICBxdWVyeS5tYXRjaChlbnRpdHkpXG4gICAgICApIHtcbiAgICAgICAgcXVlcnkuYWRkRW50aXR5KGVudGl0eSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICEhfnF1ZXJ5LkNvbXBvbmVudHMuaW5kZXhPZihDb21wb25lbnQpICYmXG4gICAgICAgICEhfnF1ZXJ5LmVudGl0aWVzLmluZGV4T2YoZW50aXR5KSAmJlxuICAgICAgICAhcXVlcnkubWF0Y2goZW50aXR5KVxuICAgICAgKSB7XG4gICAgICAgIHF1ZXJ5LnJlbW92ZUVudGl0eShlbnRpdHkpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IGEgcXVlcnkgZm9yIHRoZSBzcGVjaWZpZWQgY29tcG9uZW50c1xuICAgKiBAcGFyYW0ge0NvbXBvbmVudH0gQ29tcG9uZW50cyBDb21wb25lbnRzIHRoYXQgdGhlIHF1ZXJ5IHNob3VsZCBoYXZlXG4gICAqL1xuICBnZXRRdWVyeShDb21wb25lbnRzKSB7XG4gICAgdmFyIGtleSA9IHF1ZXJ5S2V5KENvbXBvbmVudHMpO1xuICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJpZXNba2V5XTtcbiAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICB0aGlzLl9xdWVyaWVzW2tleV0gPSBxdWVyeSA9IG5ldyBRdWVyeShDb21wb25lbnRzLCB0aGlzLl93b3JsZCk7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm4gc29tZSBzdGF0cyBmcm9tIHRoaXMgY2xhc3NcbiAgICovXG4gIHN0YXRzKCkge1xuICAgIHZhciBzdGF0cyA9IHt9O1xuICAgIGZvciAodmFyIHF1ZXJ5TmFtZSBpbiB0aGlzLl9xdWVyaWVzKSB7XG4gICAgICBzdGF0c1txdWVyeU5hbWVdID0gdGhpcy5fcXVlcmllc1txdWVyeU5hbWVdLnN0YXRzKCk7XG4gICAgfVxuICAgIHJldHVybiBzdGF0cztcbiAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIENvbXBvbmVudCB7XG4gIGNvbnN0cnVjdG9yKHByb3BzKSB7XG4gICAgaWYgKHByb3BzICE9PSBmYWxzZSkge1xuICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5jb25zdHJ1Y3Rvci5zY2hlbWE7XG5cbiAgICAgIGZvciAoY29uc3Qga2V5IGluIHNjaGVtYSkge1xuICAgICAgICBpZiAocHJvcHMgJiYgcHJvcHMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIHRoaXNba2V5XSA9IHByb3BzW2tleV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3Qgc2NoZW1hUHJvcCA9IHNjaGVtYVtrZXldO1xuICAgICAgICAgIGlmIChzY2hlbWFQcm9wLmhhc093blByb3BlcnR5KFwiZGVmYXVsdFwiKSkge1xuICAgICAgICAgICAgdGhpc1trZXldID0gc2NoZW1hUHJvcC50eXBlLmNsb25lKHNjaGVtYVByb3AuZGVmYXVsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBzY2hlbWFQcm9wLnR5cGU7XG4gICAgICAgICAgICB0aGlzW2tleV0gPSB0eXBlLmNsb25lKHR5cGUuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gXCJwcm9kdWN0aW9uXCIgJiYgcHJvcHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aGlzLmNoZWNrVW5kZWZpbmVkQXR0cmlidXRlcyhwcm9wcyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5fcG9vbCA9IG51bGw7XG4gIH1cblxuICBjb3B5KHNvdXJjZSkge1xuICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuY29uc3RydWN0b3Iuc2NoZW1hO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gc2NoZW1hKSB7XG4gICAgICBjb25zdCBwcm9wID0gc2NoZW1hW2tleV07XG5cbiAgICAgIGlmIChzb3VyY2UuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICB0aGlzW2tleV0gPSBwcm9wLnR5cGUuY29weShzb3VyY2Vba2V5XSwgdGhpc1trZXldKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBAREVCVUdcbiAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09IFwicHJvZHVjdGlvblwiKSB7XG4gICAgICB0aGlzLmNoZWNrVW5kZWZpbmVkQXR0cmlidXRlcyhzb3VyY2UpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgY2xvbmUoKSB7XG4gICAgcmV0dXJuIG5ldyB0aGlzLmNvbnN0cnVjdG9yKCkuY29weSh0aGlzKTtcbiAgfVxuXG4gIHJlc2V0KCkge1xuICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuY29uc3RydWN0b3Iuc2NoZW1hO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gc2NoZW1hKSB7XG4gICAgICBjb25zdCBzY2hlbWFQcm9wID0gc2NoZW1hW2tleV07XG5cbiAgICAgIGlmIChzY2hlbWFQcm9wLmhhc093blByb3BlcnR5KFwiZGVmYXVsdFwiKSkge1xuICAgICAgICB0aGlzW2tleV0gPSBzY2hlbWFQcm9wLnR5cGUuY29weShzY2hlbWFQcm9wLmRlZmF1bHQsIHRoaXNba2V5XSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCB0eXBlID0gc2NoZW1hUHJvcC50eXBlO1xuICAgICAgICB0aGlzW2tleV0gPSB0eXBlLmNvcHkodHlwZS5kZWZhdWx0LCB0aGlzW2tleV0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGRpc3Bvc2UoKSB7XG4gICAgaWYgKHRoaXMuX3Bvb2wpIHtcbiAgICAgIHRoaXMuX3Bvb2wucmVsZWFzZSh0aGlzKTtcbiAgICB9XG4gIH1cblxuICBnZXROYW1lKCkge1xuICAgIHJldHVybiB0aGlzLmNvbnN0cnVjdG9yLmdldE5hbWUoKTtcbiAgfVxuXG4gIGNoZWNrVW5kZWZpbmVkQXR0cmlidXRlcyhzcmMpIHtcbiAgICBjb25zdCBzY2hlbWEgPSB0aGlzLmNvbnN0cnVjdG9yLnNjaGVtYTtcblxuICAgIC8vIENoZWNrIHRoYXQgdGhlIGF0dHJpYnV0ZXMgZGVmaW5lZCBpbiBzb3VyY2UgYXJlIGFsc28gZGVmaW5lZCBpbiB0aGUgc2NoZW1hXG4gICAgT2JqZWN0LmtleXMoc3JjKS5mb3JFYWNoKChzcmNLZXkpID0+IHtcbiAgICAgIGlmICghc2NoZW1hLmhhc093blByb3BlcnR5KHNyY0tleSkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBUcnlpbmcgdG8gc2V0IGF0dHJpYnV0ZSAnJHtzcmNLZXl9JyBub3QgZGVmaW5lZCBpbiB0aGUgJyR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfScgc2NoZW1hLiBQbGVhc2UgZml4IHRoZSBzY2hlbWEsIHRoZSBhdHRyaWJ1dGUgdmFsdWUgd29uJ3QgYmUgc2V0YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbkNvbXBvbmVudC5zY2hlbWEgPSB7fTtcbkNvbXBvbmVudC5pc0NvbXBvbmVudCA9IHRydWU7XG5Db21wb25lbnQuZ2V0TmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGlzcGxheU5hbWUgfHwgdGhpcy5uYW1lO1xufTtcbiIsImltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gXCIuL0NvbXBvbmVudC5qc1wiO1xuXG5leHBvcnQgY2xhc3MgU3lzdGVtU3RhdGVDb21wb25lbnQgZXh0ZW5kcyBDb21wb25lbnQge31cblxuU3lzdGVtU3RhdGVDb21wb25lbnQuaXNTeXN0ZW1TdGF0ZUNvbXBvbmVudCA9IHRydWU7XG4iLCJpbXBvcnQgeyBPYmplY3RQb29sIH0gZnJvbSBcIi4vT2JqZWN0UG9vbC5qc1wiO1xuaW1wb3J0IFF1ZXJ5TWFuYWdlciBmcm9tIFwiLi9RdWVyeU1hbmFnZXIuanNcIjtcbmltcG9ydCBFdmVudERpc3BhdGNoZXIgZnJvbSBcIi4vRXZlbnREaXNwYXRjaGVyLmpzXCI7XG5pbXBvcnQgeyBTeXN0ZW1TdGF0ZUNvbXBvbmVudCB9IGZyb20gXCIuL1N5c3RlbVN0YXRlQ29tcG9uZW50LmpzXCI7XG5cbmNsYXNzIEVudGl0eVBvb2wgZXh0ZW5kcyBPYmplY3RQb29sIHtcbiAgY29uc3RydWN0b3IoZW50aXR5TWFuYWdlciwgZW50aXR5Q2xhc3MsIGluaXRpYWxTaXplKSB7XG4gICAgc3VwZXIoZW50aXR5Q2xhc3MsIHVuZGVmaW5lZCk7XG4gICAgdGhpcy5lbnRpdHlNYW5hZ2VyID0gZW50aXR5TWFuYWdlcjtcblxuICAgIGlmICh0eXBlb2YgaW5pdGlhbFNpemUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRoaXMuZXhwYW5kKGluaXRpYWxTaXplKTtcbiAgICB9XG4gIH1cblxuICBleHBhbmQoY291bnQpIHtcbiAgICBmb3IgKHZhciBuID0gMDsgbiA8IGNvdW50OyBuKyspIHtcbiAgICAgIHZhciBjbG9uZSA9IG5ldyB0aGlzLlQodGhpcy5lbnRpdHlNYW5hZ2VyKTtcbiAgICAgIGNsb25lLl9wb29sID0gdGhpcztcbiAgICAgIHRoaXMuZnJlZUxpc3QucHVzaChjbG9uZSk7XG4gICAgfVxuICAgIHRoaXMuY291bnQgKz0gY291bnQ7XG4gIH1cbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICogQGNsYXNzIEVudGl0eU1hbmFnZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEVudGl0eU1hbmFnZXIge1xuICBjb25zdHJ1Y3Rvcih3b3JsZCkge1xuICAgIHRoaXMud29ybGQgPSB3b3JsZDtcbiAgICB0aGlzLmNvbXBvbmVudHNNYW5hZ2VyID0gd29ybGQuY29tcG9uZW50c01hbmFnZXI7XG5cbiAgICAvLyBBbGwgdGhlIGVudGl0aWVzIGluIHRoaXMgaW5zdGFuY2VcbiAgICB0aGlzLl9lbnRpdGllcyA9IFtdO1xuICAgIHRoaXMuX25leHRFbnRpdHlJZCA9IDA7XG5cbiAgICB0aGlzLl9lbnRpdGllc0J5TmFtZXMgPSB7fTtcblxuICAgIHRoaXMuX3F1ZXJ5TWFuYWdlciA9IG5ldyBRdWVyeU1hbmFnZXIodGhpcyk7XG4gICAgdGhpcy5ldmVudERpc3BhdGNoZXIgPSBuZXcgRXZlbnREaXNwYXRjaGVyKCk7XG4gICAgdGhpcy5fZW50aXR5UG9vbCA9IG5ldyBFbnRpdHlQb29sKFxuICAgICAgdGhpcyxcbiAgICAgIHRoaXMud29ybGQub3B0aW9ucy5lbnRpdHlDbGFzcyxcbiAgICAgIHRoaXMud29ybGQub3B0aW9ucy5lbnRpdHlQb29sU2l6ZVxuICAgICk7XG5cbiAgICAvLyBEZWZlcnJlZCBkZWxldGlvblxuICAgIHRoaXMuZW50aXRpZXNXaXRoQ29tcG9uZW50c1RvUmVtb3ZlID0gW107XG4gICAgdGhpcy5lbnRpdGllc1RvUmVtb3ZlID0gW107XG4gICAgdGhpcy5kZWZlcnJlZFJlbW92YWxFbmFibGVkID0gdHJ1ZTtcbiAgfVxuXG4gIGdldEVudGl0eUJ5TmFtZShuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuX2VudGl0aWVzQnlOYW1lc1tuYW1lXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuZXcgZW50aXR5XG4gICAqL1xuICBjcmVhdGVFbnRpdHkobmFtZSkge1xuICAgIHZhciBlbnRpdHkgPSB0aGlzLl9lbnRpdHlQb29sLmFjcXVpcmUoKTtcbiAgICBlbnRpdHkuYWxpdmUgPSB0cnVlO1xuICAgIGVudGl0eS5uYW1lID0gbmFtZSB8fCBcIlwiO1xuICAgIGlmIChuYW1lKSB7XG4gICAgICBpZiAodGhpcy5fZW50aXRpZXNCeU5hbWVzW25hbWVdKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgRW50aXR5IG5hbWUgJyR7bmFtZX0nIGFscmVhZHkgZXhpc3RgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2VudGl0aWVzQnlOYW1lc1tuYW1lXSA9IGVudGl0eTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLl9lbnRpdGllcy5wdXNoKGVudGl0eSk7XG4gICAgdGhpcy5ldmVudERpc3BhdGNoZXIuZGlzcGF0Y2hFdmVudChFTlRJVFlfQ1JFQVRFRCwgZW50aXR5KTtcbiAgICByZXR1cm4gZW50aXR5O1xuICB9XG5cbiAgLy8gQ09NUE9ORU5UU1xuXG4gIC8qKlxuICAgKiBBZGQgYSBjb21wb25lbnQgdG8gYW4gZW50aXR5XG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHkgRW50aXR5IHdoZXJlIHRoZSBjb21wb25lbnQgd2lsbCBiZSBhZGRlZFxuICAgKiBAcGFyYW0ge0NvbXBvbmVudH0gQ29tcG9uZW50IENvbXBvbmVudCB0byBiZSBhZGRlZCB0byB0aGUgZW50aXR5XG4gICAqIEBwYXJhbSB7T2JqZWN0fSB2YWx1ZXMgT3B0aW9uYWwgdmFsdWVzIHRvIHJlcGxhY2UgdGhlIGRlZmF1bHQgYXR0cmlidXRlc1xuICAgKi9cbiAgZW50aXR5QWRkQ29tcG9uZW50KGVudGl0eSwgQ29tcG9uZW50LCB2YWx1ZXMpIHtcbiAgICAvLyBAdG9kbyBQcm9iYWJseSBkZWZpbmUgQ29tcG9uZW50Ll90eXBlSWQgd2l0aCBhIGRlZmF1bHQgdmFsdWUgYW5kIGF2b2lkIHVzaW5nIHR5cGVvZlxuICAgIGlmIChcbiAgICAgIHR5cGVvZiBDb21wb25lbnQuX3R5cGVJZCA9PT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgICAgIXRoaXMud29ybGQuY29tcG9uZW50c01hbmFnZXIuX0NvbXBvbmVudHNNYXBbQ29tcG9uZW50Ll90eXBlSWRdXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBBdHRlbXB0ZWQgdG8gYWRkIHVucmVnaXN0ZXJlZCBjb21wb25lbnQgXCIke0NvbXBvbmVudC5nZXROYW1lKCl9XCJgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh+ZW50aXR5Ll9Db21wb25lbnRUeXBlcy5pbmRleE9mKENvbXBvbmVudCkpIHtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gXCJwcm9kdWN0aW9uXCIpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFwiQ29tcG9uZW50IHR5cGUgYWxyZWFkeSBleGlzdHMgb24gZW50aXR5LlwiLFxuICAgICAgICAgIGVudGl0eSxcbiAgICAgICAgICBDb21wb25lbnQuZ2V0TmFtZSgpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZW50aXR5Ll9Db21wb25lbnRUeXBlcy5wdXNoKENvbXBvbmVudCk7XG5cbiAgICBpZiAoQ29tcG9uZW50Ll9fcHJvdG9fXyA9PT0gU3lzdGVtU3RhdGVDb21wb25lbnQpIHtcbiAgICAgIGVudGl0eS5udW1TdGF0ZUNvbXBvbmVudHMrKztcbiAgICB9XG5cbiAgICB2YXIgY29tcG9uZW50UG9vbCA9IHRoaXMud29ybGQuY29tcG9uZW50c01hbmFnZXIuZ2V0Q29tcG9uZW50c1Bvb2woXG4gICAgICBDb21wb25lbnRcbiAgICApO1xuXG4gICAgdmFyIGNvbXBvbmVudCA9IGNvbXBvbmVudFBvb2xcbiAgICAgID8gY29tcG9uZW50UG9vbC5hY3F1aXJlKClcbiAgICAgIDogbmV3IENvbXBvbmVudCh2YWx1ZXMpO1xuXG4gICAgaWYgKGNvbXBvbmVudFBvb2wgJiYgdmFsdWVzKSB7XG4gICAgICBjb21wb25lbnQuY29weSh2YWx1ZXMpO1xuICAgIH1cblxuICAgIGVudGl0eS5fY29tcG9uZW50c1tDb21wb25lbnQuX3R5cGVJZF0gPSBjb21wb25lbnQ7XG5cbiAgICB0aGlzLl9xdWVyeU1hbmFnZXIub25FbnRpdHlDb21wb25lbnRBZGRlZChlbnRpdHksIENvbXBvbmVudCk7XG4gICAgdGhpcy53b3JsZC5jb21wb25lbnRzTWFuYWdlci5jb21wb25lbnRBZGRlZFRvRW50aXR5KENvbXBvbmVudCk7XG5cbiAgICB0aGlzLmV2ZW50RGlzcGF0Y2hlci5kaXNwYXRjaEV2ZW50KENPTVBPTkVOVF9BRERFRCwgZW50aXR5LCBDb21wb25lbnQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhIGNvbXBvbmVudCBmcm9tIGFuIGVudGl0eVxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5IEVudGl0eSB3aGljaCB3aWxsIGdldCByZW1vdmVkIHRoZSBjb21wb25lbnRcbiAgICogQHBhcmFtIHsqfSBDb21wb25lbnQgQ29tcG9uZW50IHRvIHJlbW92ZSBmcm9tIHRoZSBlbnRpdHlcbiAgICogQHBhcmFtIHtCb29sfSBpbW1lZGlhdGVseSBJZiB5b3Ugd2FudCB0byByZW1vdmUgdGhlIGNvbXBvbmVudCBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIGRlZmVycmVkIChEZWZhdWx0IGlzIGZhbHNlKVxuICAgKi9cbiAgZW50aXR5UmVtb3ZlQ29tcG9uZW50KGVudGl0eSwgQ29tcG9uZW50LCBpbW1lZGlhdGVseSkge1xuICAgIHZhciBpbmRleCA9IGVudGl0eS5fQ29tcG9uZW50VHlwZXMuaW5kZXhPZihDb21wb25lbnQpO1xuICAgIGlmICghfmluZGV4KSByZXR1cm47XG5cbiAgICB0aGlzLmV2ZW50RGlzcGF0Y2hlci5kaXNwYXRjaEV2ZW50KENPTVBPTkVOVF9SRU1PVkUsIGVudGl0eSwgQ29tcG9uZW50KTtcblxuICAgIGlmIChpbW1lZGlhdGVseSkge1xuICAgICAgdGhpcy5fZW50aXR5UmVtb3ZlQ29tcG9uZW50U3luYyhlbnRpdHksIENvbXBvbmVudCwgaW5kZXgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZW50aXR5Ll9Db21wb25lbnRUeXBlc1RvUmVtb3ZlLmxlbmd0aCA9PT0gMClcbiAgICAgICAgdGhpcy5lbnRpdGllc1dpdGhDb21wb25lbnRzVG9SZW1vdmUucHVzaChlbnRpdHkpO1xuXG4gICAgICBlbnRpdHkuX0NvbXBvbmVudFR5cGVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICBlbnRpdHkuX0NvbXBvbmVudFR5cGVzVG9SZW1vdmUucHVzaChDb21wb25lbnQpO1xuXG4gICAgICBlbnRpdHkuX2NvbXBvbmVudHNUb1JlbW92ZVtDb21wb25lbnQuX3R5cGVJZF0gPVxuICAgICAgICBlbnRpdHkuX2NvbXBvbmVudHNbQ29tcG9uZW50Ll90eXBlSWRdO1xuICAgICAgZGVsZXRlIGVudGl0eS5fY29tcG9uZW50c1tDb21wb25lbnQuX3R5cGVJZF07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZWFjaCBpbmRleGVkIHF1ZXJ5IHRvIHNlZSBpZiB3ZSBuZWVkIHRvIHJlbW92ZSBpdFxuICAgIHRoaXMuX3F1ZXJ5TWFuYWdlci5vbkVudGl0eUNvbXBvbmVudFJlbW92ZWQoZW50aXR5LCBDb21wb25lbnQpO1xuXG4gICAgaWYgKENvbXBvbmVudC5fX3Byb3RvX18gPT09IFN5c3RlbVN0YXRlQ29tcG9uZW50KSB7XG4gICAgICBlbnRpdHkubnVtU3RhdGVDb21wb25lbnRzLS07XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSBlbnRpdHkgd2FzIGEgZ2hvc3Qgd2FpdGluZyBmb3IgdGhlIGxhc3Qgc3lzdGVtIHN0YXRlIGNvbXBvbmVudCB0byBiZSByZW1vdmVkXG4gICAgICBpZiAoZW50aXR5Lm51bVN0YXRlQ29tcG9uZW50cyA9PT0gMCAmJiAhZW50aXR5LmFsaXZlKSB7XG4gICAgICAgIGVudGl0eS5yZW1vdmUoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBfZW50aXR5UmVtb3ZlQ29tcG9uZW50U3luYyhlbnRpdHksIENvbXBvbmVudCwgaW5kZXgpIHtcbiAgICAvLyBSZW1vdmUgVCBsaXN0aW5nIG9uIGVudGl0eSBhbmQgcHJvcGVydHkgcmVmLCB0aGVuIGZyZWUgdGhlIGNvbXBvbmVudC5cbiAgICBlbnRpdHkuX0NvbXBvbmVudFR5cGVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgdmFyIGNvbXBvbmVudCA9IGVudGl0eS5fY29tcG9uZW50c1tDb21wb25lbnQuX3R5cGVJZF07XG4gICAgZGVsZXRlIGVudGl0eS5fY29tcG9uZW50c1tDb21wb25lbnQuX3R5cGVJZF07XG4gICAgY29tcG9uZW50LmRpc3Bvc2UoKTtcbiAgICB0aGlzLndvcmxkLmNvbXBvbmVudHNNYW5hZ2VyLmNvbXBvbmVudFJlbW92ZWRGcm9tRW50aXR5KENvbXBvbmVudCk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGFsbCB0aGUgY29tcG9uZW50cyBmcm9tIGFuIGVudGl0eVxuICAgKiBAcGFyYW0ge0VudGl0eX0gZW50aXR5IEVudGl0eSBmcm9tIHdoaWNoIHRoZSBjb21wb25lbnRzIHdpbGwgYmUgcmVtb3ZlZFxuICAgKi9cbiAgZW50aXR5UmVtb3ZlQWxsQ29tcG9uZW50cyhlbnRpdHksIGltbWVkaWF0ZWx5KSB7XG4gICAgbGV0IENvbXBvbmVudHMgPSBlbnRpdHkuX0NvbXBvbmVudFR5cGVzO1xuXG4gICAgZm9yIChsZXQgaiA9IENvbXBvbmVudHMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcbiAgICAgIGlmIChDb21wb25lbnRzW2pdLl9fcHJvdG9fXyAhPT0gU3lzdGVtU3RhdGVDb21wb25lbnQpXG4gICAgICAgIHRoaXMuZW50aXR5UmVtb3ZlQ29tcG9uZW50KGVudGl0eSwgQ29tcG9uZW50c1tqXSwgaW1tZWRpYXRlbHkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgdGhlIGVudGl0eSBmcm9tIHRoaXMgbWFuYWdlci4gSXQgd2lsbCBjbGVhciBhbHNvIGl0cyBjb21wb25lbnRzXG4gICAqIEBwYXJhbSB7RW50aXR5fSBlbnRpdHkgRW50aXR5IHRvIHJlbW92ZSBmcm9tIHRoZSBtYW5hZ2VyXG4gICAqIEBwYXJhbSB7Qm9vbH0gaW1tZWRpYXRlbHkgSWYgeW91IHdhbnQgdG8gcmVtb3ZlIHRoZSBjb21wb25lbnQgaW1tZWRpYXRlbHkgaW5zdGVhZCBvZiBkZWZlcnJlZCAoRGVmYXVsdCBpcyBmYWxzZSlcbiAgICovXG4gIHJlbW92ZUVudGl0eShlbnRpdHksIGltbWVkaWF0ZWx5KSB7XG4gICAgdmFyIGluZGV4ID0gdGhpcy5fZW50aXRpZXMuaW5kZXhPZihlbnRpdHkpO1xuXG4gICAgaWYgKCF+aW5kZXgpIHRocm93IG5ldyBFcnJvcihcIlRyaWVkIHRvIHJlbW92ZSBlbnRpdHkgbm90IGluIGxpc3RcIik7XG5cbiAgICBlbnRpdHkuYWxpdmUgPSBmYWxzZTtcbiAgICB0aGlzLmVudGl0eVJlbW92ZUFsbENvbXBvbmVudHMoZW50aXR5LCBpbW1lZGlhdGVseSk7XG5cbiAgICBpZiAoZW50aXR5Lm51bVN0YXRlQ29tcG9uZW50cyA9PT0gMCkge1xuICAgICAgLy8gUmVtb3ZlIGZyb20gZW50aXR5IGxpc3RcbiAgICAgIHRoaXMuZXZlbnREaXNwYXRjaGVyLmRpc3BhdGNoRXZlbnQoRU5USVRZX1JFTU9WRUQsIGVudGl0eSk7XG4gICAgICB0aGlzLl9xdWVyeU1hbmFnZXIub25FbnRpdHlSZW1vdmVkKGVudGl0eSk7XG4gICAgICBpZiAoaW1tZWRpYXRlbHkgPT09IHRydWUpIHtcbiAgICAgICAgdGhpcy5fcmVsZWFzZUVudGl0eShlbnRpdHksIGluZGV4KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW50aXRpZXNUb1JlbW92ZS5wdXNoKGVudGl0eSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX3JlbGVhc2VFbnRpdHkoZW50aXR5LCBpbmRleCkge1xuICAgIHRoaXMuX2VudGl0aWVzLnNwbGljZShpbmRleCwgMSk7XG5cbiAgICBpZiAodGhpcy5fZW50aXRpZXNCeU5hbWVzW2VudGl0eS5uYW1lXSkge1xuICAgICAgZGVsZXRlIHRoaXMuX2VudGl0aWVzQnlOYW1lc1tlbnRpdHkubmFtZV07XG4gICAgfVxuICAgIGVudGl0eS5fcG9vbC5yZWxlYXNlKGVudGl0eSk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGFsbCBlbnRpdGllcyBmcm9tIHRoaXMgbWFuYWdlclxuICAgKi9cbiAgcmVtb3ZlQWxsRW50aXRpZXMoKSB7XG4gICAgZm9yICh2YXIgaSA9IHRoaXMuX2VudGl0aWVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB0aGlzLnJlbW92ZUVudGl0eSh0aGlzLl9lbnRpdGllc1tpXSk7XG4gICAgfVxuICB9XG5cbiAgcHJvY2Vzc0RlZmVycmVkUmVtb3ZhbCgpIHtcbiAgICBpZiAoIXRoaXMuZGVmZXJyZWRSZW1vdmFsRW5hYmxlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5lbnRpdGllc1RvUmVtb3ZlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZXQgZW50aXR5ID0gdGhpcy5lbnRpdGllc1RvUmVtb3ZlW2ldO1xuICAgICAgbGV0IGluZGV4ID0gdGhpcy5fZW50aXRpZXMuaW5kZXhPZihlbnRpdHkpO1xuICAgICAgdGhpcy5fcmVsZWFzZUVudGl0eShlbnRpdHksIGluZGV4KTtcbiAgICB9XG4gICAgdGhpcy5lbnRpdGllc1RvUmVtb3ZlLmxlbmd0aCA9IDA7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZW50aXRpZXNXaXRoQ29tcG9uZW50c1RvUmVtb3ZlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZXQgZW50aXR5ID0gdGhpcy5lbnRpdGllc1dpdGhDb21wb25lbnRzVG9SZW1vdmVbaV07XG4gICAgICB3aGlsZSAoZW50aXR5Ll9Db21wb25lbnRUeXBlc1RvUmVtb3ZlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGV0IENvbXBvbmVudCA9IGVudGl0eS5fQ29tcG9uZW50VHlwZXNUb1JlbW92ZS5wb3AoKTtcblxuICAgICAgICB2YXIgY29tcG9uZW50ID0gZW50aXR5Ll9jb21wb25lbnRzVG9SZW1vdmVbQ29tcG9uZW50Ll90eXBlSWRdO1xuICAgICAgICBkZWxldGUgZW50aXR5Ll9jb21wb25lbnRzVG9SZW1vdmVbQ29tcG9uZW50Ll90eXBlSWRdO1xuICAgICAgICBjb21wb25lbnQuZGlzcG9zZSgpO1xuICAgICAgICB0aGlzLndvcmxkLmNvbXBvbmVudHNNYW5hZ2VyLmNvbXBvbmVudFJlbW92ZWRGcm9tRW50aXR5KENvbXBvbmVudCk7XG5cbiAgICAgICAgLy90aGlzLl9lbnRpdHlSZW1vdmVDb21wb25lbnRTeW5jKGVudGl0eSwgQ29tcG9uZW50LCBpbmRleCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5lbnRpdGllc1dpdGhDb21wb25lbnRzVG9SZW1vdmUubGVuZ3RoID0gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYSBxdWVyeSBiYXNlZCBvbiBhIGxpc3Qgb2YgY29tcG9uZW50c1xuICAgKiBAcGFyYW0ge0FycmF5KENvbXBvbmVudCl9IENvbXBvbmVudHMgTGlzdCBvZiBjb21wb25lbnRzIHRoYXQgd2lsbCBmb3JtIHRoZSBxdWVyeVxuICAgKi9cbiAgcXVlcnlDb21wb25lbnRzKENvbXBvbmVudHMpIHtcbiAgICByZXR1cm4gdGhpcy5fcXVlcnlNYW5hZ2VyLmdldFF1ZXJ5KENvbXBvbmVudHMpO1xuICB9XG5cbiAgLy8gRVhUUkFTXG5cbiAgLyoqXG4gICAqIFJldHVybiBudW1iZXIgb2YgZW50aXRpZXNcbiAgICovXG4gIGNvdW50KCkge1xuICAgIHJldHVybiB0aGlzLl9lbnRpdGllcy5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJuIHNvbWUgc3RhdHNcbiAgICovXG4gIHN0YXRzKCkge1xuICAgIHZhciBzdGF0cyA9IHtcbiAgICAgIG51bUVudGl0aWVzOiB0aGlzLl9lbnRpdGllcy5sZW5ndGgsXG4gICAgICBudW1RdWVyaWVzOiBPYmplY3Qua2V5cyh0aGlzLl9xdWVyeU1hbmFnZXIuX3F1ZXJpZXMpLmxlbmd0aCxcbiAgICAgIHF1ZXJpZXM6IHRoaXMuX3F1ZXJ5TWFuYWdlci5zdGF0cygpLFxuICAgICAgbnVtQ29tcG9uZW50UG9vbDogT2JqZWN0LmtleXModGhpcy5jb21wb25lbnRzTWFuYWdlci5fY29tcG9uZW50UG9vbClcbiAgICAgICAgLmxlbmd0aCxcbiAgICAgIGNvbXBvbmVudFBvb2w6IHt9LFxuICAgICAgZXZlbnREaXNwYXRjaGVyOiB0aGlzLmV2ZW50RGlzcGF0Y2hlci5zdGF0cyxcbiAgICB9O1xuXG4gICAgZm9yICh2YXIgZWNzeUNvbXBvbmVudElkIGluIHRoaXMuY29tcG9uZW50c01hbmFnZXIuX2NvbXBvbmVudFBvb2wpIHtcbiAgICAgIHZhciBwb29sID0gdGhpcy5jb21wb25lbnRzTWFuYWdlci5fY29tcG9uZW50UG9vbFtlY3N5Q29tcG9uZW50SWRdO1xuICAgICAgc3RhdHMuY29tcG9uZW50UG9vbFtwb29sLlQuZ2V0TmFtZSgpXSA9IHtcbiAgICAgICAgdXNlZDogcG9vbC50b3RhbFVzZWQoKSxcbiAgICAgICAgc2l6ZTogcG9vbC5jb3VudCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0YXRzO1xuICB9XG59XG5cbmNvbnN0IEVOVElUWV9DUkVBVEVEID0gXCJFbnRpdHlNYW5hZ2VyI0VOVElUWV9DUkVBVEVcIjtcbmNvbnN0IEVOVElUWV9SRU1PVkVEID0gXCJFbnRpdHlNYW5hZ2VyI0VOVElUWV9SRU1PVkVEXCI7XG5jb25zdCBDT01QT05FTlRfQURERUQgPSBcIkVudGl0eU1hbmFnZXIjQ09NUE9ORU5UX0FEREVEXCI7XG5jb25zdCBDT01QT05FTlRfUkVNT1ZFID0gXCJFbnRpdHlNYW5hZ2VyI0NPTVBPTkVOVF9SRU1PVkVcIjtcbiIsImltcG9ydCB7IE9iamVjdFBvb2wgfSBmcm9tIFwiLi9PYmplY3RQb29sLmpzXCI7XG5cbmV4cG9ydCBjbGFzcyBDb21wb25lbnRNYW5hZ2VyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5Db21wb25lbnRzID0gW107XG4gICAgdGhpcy5fQ29tcG9uZW50c01hcCA9IHt9O1xuXG4gICAgdGhpcy5fY29tcG9uZW50UG9vbCA9IHt9O1xuICAgIHRoaXMubnVtQ29tcG9uZW50cyA9IHt9O1xuICAgIHRoaXMubmV4dENvbXBvbmVudElkID0gMDtcbiAgfVxuXG4gIGhhc0NvbXBvbmVudChDb21wb25lbnQpIHtcbiAgICByZXR1cm4gdGhpcy5Db21wb25lbnRzLmluZGV4T2YoQ29tcG9uZW50KSAhPT0gLTE7XG4gIH1cblxuICByZWdpc3RlckNvbXBvbmVudChDb21wb25lbnQsIG9iamVjdFBvb2wpIHtcbiAgICBpZiAodGhpcy5Db21wb25lbnRzLmluZGV4T2YoQ29tcG9uZW50KSAhPT0gLTEpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYENvbXBvbmVudCB0eXBlOiAnJHtDb21wb25lbnQuZ2V0TmFtZSgpfScgYWxyZWFkeSByZWdpc3RlcmVkLmBcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc2NoZW1hID0gQ29tcG9uZW50LnNjaGVtYTtcblxuICAgIGlmICghc2NoZW1hKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBDb21wb25lbnQgXCIke0NvbXBvbmVudC5nZXROYW1lKCl9XCIgaGFzIG5vIHNjaGVtYSBwcm9wZXJ0eS5gXG4gICAgICApO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgcHJvcE5hbWUgaW4gc2NoZW1hKSB7XG4gICAgICBjb25zdCBwcm9wID0gc2NoZW1hW3Byb3BOYW1lXTtcblxuICAgICAgaWYgKCFwcm9wLnR5cGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBJbnZhbGlkIHNjaGVtYSBmb3IgY29tcG9uZW50IFwiJHtDb21wb25lbnQuZ2V0TmFtZSgpfVwiLiBNaXNzaW5nIHR5cGUgZm9yIFwiJHtwcm9wTmFtZX1cIiBwcm9wZXJ0eS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgQ29tcG9uZW50Ll90eXBlSWQgPSB0aGlzLm5leHRDb21wb25lbnRJZCsrO1xuICAgIHRoaXMuQ29tcG9uZW50cy5wdXNoKENvbXBvbmVudCk7XG4gICAgdGhpcy5fQ29tcG9uZW50c01hcFtDb21wb25lbnQuX3R5cGVJZF0gPSBDb21wb25lbnQ7XG4gICAgdGhpcy5udW1Db21wb25lbnRzW0NvbXBvbmVudC5fdHlwZUlkXSA9IDA7XG5cbiAgICBpZiAob2JqZWN0UG9vbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBvYmplY3RQb29sID0gbmV3IE9iamVjdFBvb2woQ29tcG9uZW50KTtcbiAgICB9IGVsc2UgaWYgKG9iamVjdFBvb2wgPT09IGZhbHNlKSB7XG4gICAgICBvYmplY3RQb29sID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHRoaXMuX2NvbXBvbmVudFBvb2xbQ29tcG9uZW50Ll90eXBlSWRdID0gb2JqZWN0UG9vbDtcbiAgfVxuXG4gIGNvbXBvbmVudEFkZGVkVG9FbnRpdHkoQ29tcG9uZW50KSB7XG4gICAgdGhpcy5udW1Db21wb25lbnRzW0NvbXBvbmVudC5fdHlwZUlkXSsrO1xuICB9XG5cbiAgY29tcG9uZW50UmVtb3ZlZEZyb21FbnRpdHkoQ29tcG9uZW50KSB7XG4gICAgdGhpcy5udW1Db21wb25lbnRzW0NvbXBvbmVudC5fdHlwZUlkXS0tO1xuICB9XG5cbiAgZ2V0Q29tcG9uZW50c1Bvb2woQ29tcG9uZW50KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbXBvbmVudFBvb2xbQ29tcG9uZW50Ll90eXBlSWRdO1xuICB9XG59XG4iLCJleHBvcnQgY29uc3QgVmVyc2lvbiA9IFwiMC4zLjFcIjtcbiIsImNvbnN0IHByb3h5TWFwID0gbmV3IFdlYWtNYXAoKTtcblxuY29uc3QgcHJveHlIYW5kbGVyID0ge1xuICBzZXQodGFyZ2V0LCBwcm9wKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYFRyaWVkIHRvIHdyaXRlIHRvIFwiJHt0YXJnZXQuY29uc3RydWN0b3IuZ2V0TmFtZSgpfSMke1N0cmluZyhcbiAgICAgICAgcHJvcFxuICAgICAgKX1cIiBvbiBpbW11dGFibGUgY29tcG9uZW50LiBVc2UgLmdldE11dGFibGVDb21wb25lbnQoKSB0byBtb2RpZnkgYSBjb21wb25lbnQuYFxuICAgICk7XG4gIH0sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiB3cmFwSW1tdXRhYmxlQ29tcG9uZW50KFQsIGNvbXBvbmVudCkge1xuICBpZiAoY29tcG9uZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgbGV0IHdyYXBwZWRDb21wb25lbnQgPSBwcm94eU1hcC5nZXQoY29tcG9uZW50KTtcblxuICBpZiAoIXdyYXBwZWRDb21wb25lbnQpIHtcbiAgICB3cmFwcGVkQ29tcG9uZW50ID0gbmV3IFByb3h5KGNvbXBvbmVudCwgcHJveHlIYW5kbGVyKTtcbiAgICBwcm94eU1hcC5zZXQoY29tcG9uZW50LCB3cmFwcGVkQ29tcG9uZW50KTtcbiAgfVxuXG4gIHJldHVybiB3cmFwcGVkQ29tcG9uZW50O1xufVxuIiwiaW1wb3J0IFF1ZXJ5IGZyb20gXCIuL1F1ZXJ5LmpzXCI7XG5pbXBvcnQgd3JhcEltbXV0YWJsZUNvbXBvbmVudCBmcm9tIFwiLi9XcmFwSW1tdXRhYmxlQ29tcG9uZW50LmpzXCI7XG5cbmV4cG9ydCBjbGFzcyBFbnRpdHkge1xuICBjb25zdHJ1Y3RvcihlbnRpdHlNYW5hZ2VyKSB7XG4gICAgdGhpcy5fZW50aXR5TWFuYWdlciA9IGVudGl0eU1hbmFnZXIgfHwgbnVsbDtcblxuICAgIC8vIFVuaXF1ZSBJRCBmb3IgdGhpcyBlbnRpdHlcbiAgICB0aGlzLmlkID0gZW50aXR5TWFuYWdlci5fbmV4dEVudGl0eUlkKys7XG5cbiAgICAvLyBMaXN0IG9mIGNvbXBvbmVudHMgdHlwZXMgdGhlIGVudGl0eSBoYXNcbiAgICB0aGlzLl9Db21wb25lbnRUeXBlcyA9IFtdO1xuXG4gICAgLy8gSW5zdGFuY2Ugb2YgdGhlIGNvbXBvbmVudHNcbiAgICB0aGlzLl9jb21wb25lbnRzID0ge307XG5cbiAgICB0aGlzLl9jb21wb25lbnRzVG9SZW1vdmUgPSB7fTtcblxuICAgIC8vIFF1ZXJpZXMgd2hlcmUgdGhlIGVudGl0eSBpcyBhZGRlZFxuICAgIHRoaXMucXVlcmllcyA9IFtdO1xuXG4gICAgLy8gVXNlZCBmb3IgZGVmZXJyZWQgcmVtb3ZhbFxuICAgIHRoaXMuX0NvbXBvbmVudFR5cGVzVG9SZW1vdmUgPSBbXTtcblxuICAgIHRoaXMuYWxpdmUgPSBmYWxzZTtcblxuICAgIC8vaWYgdGhlcmUgYXJlIHN0YXRlIGNvbXBvbmVudHMgb24gYSBlbnRpdHksIGl0IGNhbid0IGJlIHJlbW92ZWQgY29tcGxldGVseVxuICAgIHRoaXMubnVtU3RhdGVDb21wb25lbnRzID0gMDtcbiAgfVxuXG4gIC8vIENPTVBPTkVOVFNcblxuICBnZXRDb21wb25lbnQoQ29tcG9uZW50LCBpbmNsdWRlUmVtb3ZlZCkge1xuICAgIHZhciBjb21wb25lbnQgPSB0aGlzLl9jb21wb25lbnRzW0NvbXBvbmVudC5fdHlwZUlkXTtcblxuICAgIGlmICghY29tcG9uZW50ICYmIGluY2x1ZGVSZW1vdmVkID09PSB0cnVlKSB7XG4gICAgICBjb21wb25lbnQgPSB0aGlzLl9jb21wb25lbnRzVG9SZW1vdmVbQ29tcG9uZW50Ll90eXBlSWRdO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gXCJwcm9kdWN0aW9uXCJcbiAgICAgID8gd3JhcEltbXV0YWJsZUNvbXBvbmVudChDb21wb25lbnQsIGNvbXBvbmVudClcbiAgICAgIDogY29tcG9uZW50O1xuICB9XG5cbiAgZ2V0UmVtb3ZlZENvbXBvbmVudChDb21wb25lbnQpIHtcbiAgICBjb25zdCBjb21wb25lbnQgPSB0aGlzLl9jb21wb25lbnRzVG9SZW1vdmVbQ29tcG9uZW50Ll90eXBlSWRdO1xuXG4gICAgcmV0dXJuIHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSBcInByb2R1Y3Rpb25cIlxuICAgICAgPyB3cmFwSW1tdXRhYmxlQ29tcG9uZW50KENvbXBvbmVudCwgY29tcG9uZW50KVxuICAgICAgOiBjb21wb25lbnQ7XG4gIH1cblxuICBnZXRDb21wb25lbnRzKCkge1xuICAgIHJldHVybiB0aGlzLl9jb21wb25lbnRzO1xuICB9XG5cbiAgZ2V0Q29tcG9uZW50c1RvUmVtb3ZlKCkge1xuICAgIHJldHVybiB0aGlzLl9jb21wb25lbnRzVG9SZW1vdmU7XG4gIH1cblxuICBnZXRDb21wb25lbnRUeXBlcygpIHtcbiAgICByZXR1cm4gdGhpcy5fQ29tcG9uZW50VHlwZXM7XG4gIH1cblxuICBnZXRNdXRhYmxlQ29tcG9uZW50KENvbXBvbmVudCkge1xuICAgIHZhciBjb21wb25lbnQgPSB0aGlzLl9jb21wb25lbnRzW0NvbXBvbmVudC5fdHlwZUlkXTtcblxuICAgIGlmICghY29tcG9uZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnF1ZXJpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBxdWVyeSA9IHRoaXMucXVlcmllc1tpXTtcbiAgICAgIC8vIEB0b2RvIGFjY2VsZXJhdGUgdGhpcyBjaGVjay4gTWF5YmUgaGF2aW5nIHF1ZXJ5Ll9Db21wb25lbnRzIGFzIGFuIG9iamVjdFxuICAgICAgLy8gQHRvZG8gYWRkIE5vdCBjb21wb25lbnRzXG4gICAgICBpZiAocXVlcnkucmVhY3RpdmUgJiYgcXVlcnkuQ29tcG9uZW50cy5pbmRleE9mKENvbXBvbmVudCkgIT09IC0xKSB7XG4gICAgICAgIHF1ZXJ5LmV2ZW50RGlzcGF0Y2hlci5kaXNwYXRjaEV2ZW50KFxuICAgICAgICAgIFF1ZXJ5LnByb3RvdHlwZS5DT01QT05FTlRfQ0hBTkdFRCxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIGNvbXBvbmVudFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29tcG9uZW50O1xuICB9XG5cbiAgYWRkQ29tcG9uZW50KENvbXBvbmVudCwgdmFsdWVzKSB7XG4gICAgdGhpcy5fZW50aXR5TWFuYWdlci5lbnRpdHlBZGRDb21wb25lbnQodGhpcywgQ29tcG9uZW50LCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgcmVtb3ZlQ29tcG9uZW50KENvbXBvbmVudCwgZm9yY2VJbW1lZGlhdGUpIHtcbiAgICB0aGlzLl9lbnRpdHlNYW5hZ2VyLmVudGl0eVJlbW92ZUNvbXBvbmVudCh0aGlzLCBDb21wb25lbnQsIGZvcmNlSW1tZWRpYXRlKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGhhc0NvbXBvbmVudChDb21wb25lbnQsIGluY2x1ZGVSZW1vdmVkKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICEhfnRoaXMuX0NvbXBvbmVudFR5cGVzLmluZGV4T2YoQ29tcG9uZW50KSB8fFxuICAgICAgKGluY2x1ZGVSZW1vdmVkID09PSB0cnVlICYmIHRoaXMuaGFzUmVtb3ZlZENvbXBvbmVudChDb21wb25lbnQpKVxuICAgICk7XG4gIH1cblxuICBoYXNSZW1vdmVkQ29tcG9uZW50KENvbXBvbmVudCkge1xuICAgIHJldHVybiAhIX50aGlzLl9Db21wb25lbnRUeXBlc1RvUmVtb3ZlLmluZGV4T2YoQ29tcG9uZW50KTtcbiAgfVxuXG4gIGhhc0FsbENvbXBvbmVudHMoQ29tcG9uZW50cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgQ29tcG9uZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKCF0aGlzLmhhc0NvbXBvbmVudChDb21wb25lbnRzW2ldKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGhhc0FueUNvbXBvbmVudHMoQ29tcG9uZW50cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgQ29tcG9uZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHRoaXMuaGFzQ29tcG9uZW50KENvbXBvbmVudHNbaV0pKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmVtb3ZlQWxsQ29tcG9uZW50cyhmb3JjZUltbWVkaWF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9lbnRpdHlNYW5hZ2VyLmVudGl0eVJlbW92ZUFsbENvbXBvbmVudHModGhpcywgZm9yY2VJbW1lZGlhdGUpO1xuICB9XG5cbiAgY29weShzcmMpIHtcbiAgICAvLyBUT0RPOiBUaGlzIGNhbiBkZWZpbml0ZWx5IGJlIG9wdGltaXplZFxuICAgIGZvciAodmFyIGVjc3lDb21wb25lbnRJZCBpbiBzcmMuX2NvbXBvbmVudHMpIHtcbiAgICAgIHZhciBzcmNDb21wb25lbnQgPSBzcmMuX2NvbXBvbmVudHNbZWNzeUNvbXBvbmVudElkXTtcbiAgICAgIHRoaXMuYWRkQ29tcG9uZW50KHNyY0NvbXBvbmVudC5jb25zdHJ1Y3Rvcik7XG4gICAgICB2YXIgY29tcG9uZW50ID0gdGhpcy5nZXRDb21wb25lbnQoc3JjQ29tcG9uZW50LmNvbnN0cnVjdG9yKTtcbiAgICAgIGNvbXBvbmVudC5jb3B5KHNyY0NvbXBvbmVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBjbG9uZSgpIHtcbiAgICByZXR1cm4gbmV3IEVudGl0eSh0aGlzLl9lbnRpdHlNYW5hZ2VyKS5jb3B5KHRoaXMpO1xuICB9XG5cbiAgcmVzZXQoKSB7XG4gICAgdGhpcy5pZCA9IHRoaXMuX2VudGl0eU1hbmFnZXIuX25leHRFbnRpdHlJZCsrO1xuICAgIHRoaXMuX0NvbXBvbmVudFR5cGVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5xdWVyaWVzLmxlbmd0aCA9IDA7XG5cbiAgICBmb3IgKHZhciBlY3N5Q29tcG9uZW50SWQgaW4gdGhpcy5fY29tcG9uZW50cykge1xuICAgICAgZGVsZXRlIHRoaXMuX2NvbXBvbmVudHNbZWNzeUNvbXBvbmVudElkXTtcbiAgICB9XG4gIH1cblxuICByZW1vdmUoZm9yY2VJbW1lZGlhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fZW50aXR5TWFuYWdlci5yZW1vdmVFbnRpdHkodGhpcywgZm9yY2VJbW1lZGlhdGUpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBTeXN0ZW1NYW5hZ2VyIH0gZnJvbSBcIi4vU3lzdGVtTWFuYWdlci5qc1wiO1xuaW1wb3J0IHsgRW50aXR5TWFuYWdlciB9IGZyb20gXCIuL0VudGl0eU1hbmFnZXIuanNcIjtcbmltcG9ydCB7IENvbXBvbmVudE1hbmFnZXIgfSBmcm9tIFwiLi9Db21wb25lbnRNYW5hZ2VyLmpzXCI7XG5pbXBvcnQgeyBWZXJzaW9uIH0gZnJvbSBcIi4vVmVyc2lvbi5qc1wiO1xuaW1wb3J0IHsgaGFzV2luZG93LCBub3cgfSBmcm9tIFwiLi9VdGlscy5qc1wiO1xuaW1wb3J0IHsgRW50aXR5IH0gZnJvbSBcIi4vRW50aXR5LmpzXCI7XG5cbmNvbnN0IERFRkFVTFRfT1BUSU9OUyA9IHtcbiAgZW50aXR5UG9vbFNpemU6IDAsXG4gIGVudGl0eUNsYXNzOiBFbnRpdHksXG59O1xuXG5leHBvcnQgY2xhc3MgV29ybGQge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLm9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX09QVElPTlMsIG9wdGlvbnMpO1xuXG4gICAgdGhpcy5jb21wb25lbnRzTWFuYWdlciA9IG5ldyBDb21wb25lbnRNYW5hZ2VyKHRoaXMpO1xuICAgIHRoaXMuZW50aXR5TWFuYWdlciA9IG5ldyBFbnRpdHlNYW5hZ2VyKHRoaXMpO1xuICAgIHRoaXMuc3lzdGVtTWFuYWdlciA9IG5ldyBTeXN0ZW1NYW5hZ2VyKHRoaXMpO1xuXG4gICAgdGhpcy5lbmFibGVkID0gdHJ1ZTtcblxuICAgIHRoaXMuZXZlbnRRdWV1ZXMgPSB7fTtcblxuICAgIGlmIChoYXNXaW5kb3cgJiYgdHlwZW9mIEN1c3RvbUV2ZW50ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICB2YXIgZXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoXCJlY3N5LXdvcmxkLWNyZWF0ZWRcIiwge1xuICAgICAgICBkZXRhaWw6IHsgd29ybGQ6IHRoaXMsIHZlcnNpb246IFZlcnNpb24gfSxcbiAgICAgIH0pO1xuICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuICAgIH1cblxuICAgIHRoaXMubGFzdFRpbWUgPSBub3coKSAvIDEwMDA7XG4gIH1cblxuICByZWdpc3RlckNvbXBvbmVudChDb21wb25lbnQsIG9iamVjdFBvb2wpIHtcbiAgICB0aGlzLmNvbXBvbmVudHNNYW5hZ2VyLnJlZ2lzdGVyQ29tcG9uZW50KENvbXBvbmVudCwgb2JqZWN0UG9vbCk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICByZWdpc3RlclN5c3RlbShTeXN0ZW0sIGF0dHJpYnV0ZXMpIHtcbiAgICB0aGlzLnN5c3RlbU1hbmFnZXIucmVnaXN0ZXJTeXN0ZW0oU3lzdGVtLCBhdHRyaWJ1dGVzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGhhc1JlZ2lzdGVyZWRDb21wb25lbnQoQ29tcG9uZW50KSB7XG4gICAgcmV0dXJuIHRoaXMuY29tcG9uZW50c01hbmFnZXIuaGFzQ29tcG9uZW50KENvbXBvbmVudCk7XG4gIH1cblxuICB1bnJlZ2lzdGVyU3lzdGVtKFN5c3RlbSkge1xuICAgIHRoaXMuc3lzdGVtTWFuYWdlci51bnJlZ2lzdGVyU3lzdGVtKFN5c3RlbSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBnZXRTeXN0ZW0oU3lzdGVtQ2xhc3MpIHtcbiAgICByZXR1cm4gdGhpcy5zeXN0ZW1NYW5hZ2VyLmdldFN5c3RlbShTeXN0ZW1DbGFzcyk7XG4gIH1cblxuICBnZXRTeXN0ZW1zKCkge1xuICAgIHJldHVybiB0aGlzLnN5c3RlbU1hbmFnZXIuZ2V0U3lzdGVtcygpO1xuICB9XG5cbiAgZXhlY3V0ZShkZWx0YSwgdGltZSkge1xuICAgIGlmICghZGVsdGEpIHtcbiAgICAgIHRpbWUgPSBub3coKSAvIDEwMDA7XG4gICAgICBkZWx0YSA9IHRpbWUgLSB0aGlzLmxhc3RUaW1lO1xuICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZW5hYmxlZCkge1xuICAgICAgdGhpcy5zeXN0ZW1NYW5hZ2VyLmV4ZWN1dGUoZGVsdGEsIHRpbWUpO1xuICAgICAgdGhpcy5lbnRpdHlNYW5hZ2VyLnByb2Nlc3NEZWZlcnJlZFJlbW92YWwoKTtcbiAgICB9XG4gIH1cblxuICBzdG9wKCkge1xuICAgIHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuICB9XG5cbiAgcGxheSgpIHtcbiAgICB0aGlzLmVuYWJsZWQgPSB0cnVlO1xuICB9XG5cbiAgY3JlYXRlRW50aXR5KG5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5lbnRpdHlNYW5hZ2VyLmNyZWF0ZUVudGl0eShuYW1lKTtcbiAgfVxuXG4gIHN0YXRzKCkge1xuICAgIHZhciBzdGF0cyA9IHtcbiAgICAgIGVudGl0aWVzOiB0aGlzLmVudGl0eU1hbmFnZXIuc3RhdHMoKSxcbiAgICAgIHN5c3RlbTogdGhpcy5zeXN0ZW1NYW5hZ2VyLnN0YXRzKCksXG4gICAgfTtcblxuICAgIHJldHVybiBzdGF0cztcbiAgfVxufVxuIiwiaW1wb3J0IFF1ZXJ5IGZyb20gXCIuL1F1ZXJ5LmpzXCI7XG5pbXBvcnQgeyBjb21wb25lbnRSZWdpc3RlcmVkIH0gZnJvbSBcIi4vVXRpbHMuanNcIjtcblxuZXhwb3J0IGNsYXNzIFN5c3RlbSB7XG4gIGNhbkV4ZWN1dGUoKSB7XG4gICAgaWYgKHRoaXMuX21hbmRhdG9yeVF1ZXJpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gdHJ1ZTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbWFuZGF0b3J5UXVlcmllcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fbWFuZGF0b3J5UXVlcmllc1tpXTtcbiAgICAgIGlmIChxdWVyeS5lbnRpdGllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgZ2V0TmFtZSgpIHtcbiAgICByZXR1cm4gdGhpcy5jb25zdHJ1Y3Rvci5nZXROYW1lKCk7XG4gIH1cblxuICBjb25zdHJ1Y3Rvcih3b3JsZCwgYXR0cmlidXRlcykge1xuICAgIHRoaXMud29ybGQgPSB3b3JsZDtcbiAgICB0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXG4gICAgLy8gQHRvZG8gQmV0dGVyIG5hbWluZyA6KVxuICAgIHRoaXMuX3F1ZXJpZXMgPSB7fTtcbiAgICB0aGlzLnF1ZXJpZXMgPSB7fTtcblxuICAgIHRoaXMucHJpb3JpdHkgPSAwO1xuXG4gICAgLy8gVXNlZCBmb3Igc3RhdHNcbiAgICB0aGlzLmV4ZWN1dGVUaW1lID0gMDtcblxuICAgIGlmIChhdHRyaWJ1dGVzICYmIGF0dHJpYnV0ZXMucHJpb3JpdHkpIHtcbiAgICAgIHRoaXMucHJpb3JpdHkgPSBhdHRyaWJ1dGVzLnByaW9yaXR5O1xuICAgIH1cblxuICAgIHRoaXMuX21hbmRhdG9yeVF1ZXJpZXMgPSBbXTtcblxuICAgIHRoaXMuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG4gICAgaWYgKHRoaXMuY29uc3RydWN0b3IucXVlcmllcykge1xuICAgICAgZm9yICh2YXIgcXVlcnlOYW1lIGluIHRoaXMuY29uc3RydWN0b3IucXVlcmllcykge1xuICAgICAgICB2YXIgcXVlcnlDb25maWcgPSB0aGlzLmNvbnN0cnVjdG9yLnF1ZXJpZXNbcXVlcnlOYW1lXTtcbiAgICAgICAgdmFyIENvbXBvbmVudHMgPSBxdWVyeUNvbmZpZy5jb21wb25lbnRzO1xuICAgICAgICBpZiAoIUNvbXBvbmVudHMgfHwgQ29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCInY29tcG9uZW50cycgYXR0cmlidXRlIGNhbid0IGJlIGVtcHR5IGluIGEgcXVlcnlcIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZXRlY3QgaWYgdGhlIGNvbXBvbmVudHMgaGF2ZSBhbHJlYWR5IGJlZW4gcmVnaXN0ZXJlZFxuICAgICAgICBsZXQgdW5yZWdpc3RlcmVkQ29tcG9uZW50cyA9IENvbXBvbmVudHMuZmlsdGVyKFxuICAgICAgICAgIChDb21wb25lbnQpID0+ICFjb21wb25lbnRSZWdpc3RlcmVkKENvbXBvbmVudClcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAodW5yZWdpc3RlcmVkQ29tcG9uZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYFRyaWVkIHRvIGNyZWF0ZSBhIHF1ZXJ5ICcke1xuICAgICAgICAgICAgICB0aGlzLmNvbnN0cnVjdG9yLm5hbWVcbiAgICAgICAgICAgIH0uJHtxdWVyeU5hbWV9JyB3aXRoIHVucmVnaXN0ZXJlZCBjb21wb25lbnRzOiBbJHt1bnJlZ2lzdGVyZWRDb21wb25lbnRzXG4gICAgICAgICAgICAgIC5tYXAoKGMpID0+IGMuZ2V0TmFtZSgpKVxuICAgICAgICAgICAgICAuam9pbihcIiwgXCIpfV1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMud29ybGQuZW50aXR5TWFuYWdlci5xdWVyeUNvbXBvbmVudHMoQ29tcG9uZW50cyk7XG5cbiAgICAgICAgdGhpcy5fcXVlcmllc1txdWVyeU5hbWVdID0gcXVlcnk7XG4gICAgICAgIGlmIChxdWVyeUNvbmZpZy5tYW5kYXRvcnkgPT09IHRydWUpIHtcbiAgICAgICAgICB0aGlzLl9tYW5kYXRvcnlRdWVyaWVzLnB1c2gocXVlcnkpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucXVlcmllc1txdWVyeU5hbWVdID0ge1xuICAgICAgICAgIHJlc3VsdHM6IHF1ZXJ5LmVudGl0aWVzLFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFJlYWN0aXZlIGNvbmZpZ3VyYXRpb24gYWRkZWQvcmVtb3ZlZC9jaGFuZ2VkXG4gICAgICAgIHZhciB2YWxpZEV2ZW50cyA9IFtcImFkZGVkXCIsIFwicmVtb3ZlZFwiLCBcImNoYW5nZWRcIl07XG5cbiAgICAgICAgY29uc3QgZXZlbnRNYXBwaW5nID0ge1xuICAgICAgICAgIGFkZGVkOiBRdWVyeS5wcm90b3R5cGUuRU5USVRZX0FEREVELFxuICAgICAgICAgIHJlbW92ZWQ6IFF1ZXJ5LnByb3RvdHlwZS5FTlRJVFlfUkVNT1ZFRCxcbiAgICAgICAgICBjaGFuZ2VkOiBRdWVyeS5wcm90b3R5cGUuQ09NUE9ORU5UX0NIQU5HRUQsIC8vIFF1ZXJ5LnByb3RvdHlwZS5FTlRJVFlfQ0hBTkdFRFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChxdWVyeUNvbmZpZy5saXN0ZW4pIHtcbiAgICAgICAgICB2YWxpZEV2ZW50cy5mb3JFYWNoKChldmVudE5hbWUpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy5leGVjdXRlKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgICBgU3lzdGVtICcke3RoaXMuZ2V0TmFtZSgpfScgaGFzIGRlZmluZWQgbGlzdGVuIGV2ZW50cyAoJHt2YWxpZEV2ZW50cy5qb2luKFxuICAgICAgICAgICAgICAgICAgXCIsIFwiXG4gICAgICAgICAgICAgICAgKX0pIGZvciBxdWVyeSAnJHtxdWVyeU5hbWV9JyBidXQgaXQgZG9lcyBub3QgaW1wbGVtZW50IHRoZSAnZXhlY3V0ZScgbWV0aG9kLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSXMgdGhlIGV2ZW50IGVuYWJsZWQgb24gdGhpcyBzeXN0ZW0ncyBxdWVyeT9cbiAgICAgICAgICAgIGlmIChxdWVyeUNvbmZpZy5saXN0ZW5bZXZlbnROYW1lXSkge1xuICAgICAgICAgICAgICBsZXQgZXZlbnQgPSBxdWVyeUNvbmZpZy5saXN0ZW5bZXZlbnROYW1lXTtcblxuICAgICAgICAgICAgICBpZiAoZXZlbnROYW1lID09PSBcImNoYW5nZWRcIikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5LnJlYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgIC8vIEFueSBjaGFuZ2Ugb24gdGhlIGVudGl0eSBmcm9tIHRoZSBjb21wb25lbnRzIGluIHRoZSBxdWVyeVxuICAgICAgICAgICAgICAgICAgbGV0IGV2ZW50TGlzdCA9ICh0aGlzLnF1ZXJpZXNbcXVlcnlOYW1lXVtldmVudE5hbWVdID0gW10pO1xuICAgICAgICAgICAgICAgICAgcXVlcnkuZXZlbnREaXNwYXRjaGVyLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICAgICAgICAgICAgIFF1ZXJ5LnByb3RvdHlwZS5DT01QT05FTlRfQ0hBTkdFRCxcbiAgICAgICAgICAgICAgICAgICAgKGVudGl0eSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIC8vIEF2b2lkIGR1cGxpY2F0ZXNcbiAgICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnRMaXN0LmluZGV4T2YoZW50aXR5KSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50TGlzdC5wdXNoKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShldmVudCkpIHtcbiAgICAgICAgICAgICAgICAgIGxldCBldmVudExpc3QgPSAodGhpcy5xdWVyaWVzW3F1ZXJ5TmFtZV1bZXZlbnROYW1lXSA9IFtdKTtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LmV2ZW50RGlzcGF0Y2hlci5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAgICAgICAgICAgICBRdWVyeS5wcm90b3R5cGUuQ09NUE9ORU5UX0NIQU5HRUQsXG4gICAgICAgICAgICAgICAgICAgIChlbnRpdHksIGNoYW5nZWRDb21wb25lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAvLyBBdm9pZCBkdXBsaWNhdGVzXG4gICAgICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuaW5kZXhPZihjaGFuZ2VkQ29tcG9uZW50LmNvbnN0cnVjdG9yKSAhPT0gLTEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50TGlzdC5pbmRleE9mKGVudGl0eSkgPT09IC0xXG4gICAgICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudExpc3QucHVzaChlbnRpdHkpO1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgIC8vIENoZWNraW5nIGp1c3Qgc3BlY2lmaWMgY29tcG9uZW50c1xuICAgICAgICAgICAgICAgICAgbGV0IGNoYW5nZWRMaXN0ID0gKHRoaXMucXVlcmllc1txdWVyeU5hbWVdW2V2ZW50TmFtZV0gPSB7fSk7XG4gICAgICAgICAgICAgICAgICBldmVudC5mb3JFYWNoKGNvbXBvbmVudCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBldmVudExpc3QgPSAoY2hhbmdlZExpc3RbXG4gICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50UHJvcGVydHlOYW1lKGNvbXBvbmVudClcbiAgICAgICAgICAgICAgICAgICAgXSA9IFtdKTtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkuZXZlbnREaXNwYXRjaGVyLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICAgICAgICAgICAgICAgUXVlcnkucHJvdG90eXBlLkNPTVBPTkVOVF9DSEFOR0VELFxuICAgICAgICAgICAgICAgICAgICAgIChlbnRpdHksIGNoYW5nZWRDb21wb25lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlZENvbXBvbmVudC5jb25zdHJ1Y3RvciA9PT0gY29tcG9uZW50ICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50TGlzdC5pbmRleE9mKGVudGl0eSkgPT09IC0xXG4gICAgICAgICAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRMaXN0LnB1c2goZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCBldmVudExpc3QgPSAodGhpcy5xdWVyaWVzW3F1ZXJ5TmFtZV1bZXZlbnROYW1lXSA9IFtdKTtcblxuICAgICAgICAgICAgICAgIHF1ZXJ5LmV2ZW50RGlzcGF0Y2hlci5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAgICAgICAgICAgZXZlbnRNYXBwaW5nW2V2ZW50TmFtZV0sXG4gICAgICAgICAgICAgICAgICAoZW50aXR5KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEBmaXhtZSBvdmVyaGVhZD9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50TGlzdC5pbmRleE9mKGVudGl0eSkgPT09IC0xKVxuICAgICAgICAgICAgICAgICAgICAgIGV2ZW50TGlzdC5wdXNoKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0aGlzLmV4ZWN1dGVUaW1lID0gMDtcbiAgICB0aGlzLmVuYWJsZWQgPSBmYWxzZTtcbiAgfVxuXG4gIHBsYXkoKSB7XG4gICAgdGhpcy5lbmFibGVkID0gdHJ1ZTtcbiAgfVxuXG4gIC8vIEBxdWVzdGlvbiByZW5hbWUgdG8gY2xlYXIgcXVldWVzP1xuICBjbGVhckV2ZW50cygpIHtcbiAgICBmb3IgKGxldCBxdWVyeU5hbWUgaW4gdGhpcy5xdWVyaWVzKSB7XG4gICAgICB2YXIgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcXVlcnlOYW1lXTtcbiAgICAgIGlmIChxdWVyeS5hZGRlZCkge1xuICAgICAgICBxdWVyeS5hZGRlZC5sZW5ndGggPSAwO1xuICAgICAgfVxuICAgICAgaWYgKHF1ZXJ5LnJlbW92ZWQpIHtcbiAgICAgICAgcXVlcnkucmVtb3ZlZC5sZW5ndGggPSAwO1xuICAgICAgfVxuICAgICAgaWYgKHF1ZXJ5LmNoYW5nZWQpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocXVlcnkuY2hhbmdlZCkpIHtcbiAgICAgICAgICBxdWVyeS5jaGFuZ2VkLmxlbmd0aCA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yIChsZXQgbmFtZSBpbiBxdWVyeS5jaGFuZ2VkKSB7XG4gICAgICAgICAgICBxdWVyeS5jaGFuZ2VkW25hbWVdLmxlbmd0aCA9IDA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdG9KU09OKCkge1xuICAgIHZhciBqc29uID0ge1xuICAgICAgbmFtZTogdGhpcy5nZXROYW1lKCksXG4gICAgICBlbmFibGVkOiB0aGlzLmVuYWJsZWQsXG4gICAgICBleGVjdXRlVGltZTogdGhpcy5leGVjdXRlVGltZSxcbiAgICAgIHByaW9yaXR5OiB0aGlzLnByaW9yaXR5LFxuICAgICAgcXVlcmllczoge30sXG4gICAgfTtcblxuICAgIGlmICh0aGlzLmNvbnN0cnVjdG9yLnF1ZXJpZXMpIHtcbiAgICAgIHZhciBxdWVyaWVzID0gdGhpcy5jb25zdHJ1Y3Rvci5xdWVyaWVzO1xuICAgICAgZm9yIChsZXQgcXVlcnlOYW1lIGluIHF1ZXJpZXMpIHtcbiAgICAgICAgbGV0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3F1ZXJ5TmFtZV07XG4gICAgICAgIGxldCBxdWVyeURlZmluaXRpb24gPSBxdWVyaWVzW3F1ZXJ5TmFtZV07XG4gICAgICAgIGxldCBqc29uUXVlcnkgPSAoanNvbi5xdWVyaWVzW3F1ZXJ5TmFtZV0gPSB7XG4gICAgICAgICAga2V5OiB0aGlzLl9xdWVyaWVzW3F1ZXJ5TmFtZV0ua2V5LFxuICAgICAgICB9KTtcblxuICAgICAgICBqc29uUXVlcnkubWFuZGF0b3J5ID0gcXVlcnlEZWZpbml0aW9uLm1hbmRhdG9yeSA9PT0gdHJ1ZTtcbiAgICAgICAganNvblF1ZXJ5LnJlYWN0aXZlID1cbiAgICAgICAgICBxdWVyeURlZmluaXRpb24ubGlzdGVuICYmXG4gICAgICAgICAgKHF1ZXJ5RGVmaW5pdGlvbi5saXN0ZW4uYWRkZWQgPT09IHRydWUgfHxcbiAgICAgICAgICAgIHF1ZXJ5RGVmaW5pdGlvbi5saXN0ZW4ucmVtb3ZlZCA9PT0gdHJ1ZSB8fFxuICAgICAgICAgICAgcXVlcnlEZWZpbml0aW9uLmxpc3Rlbi5jaGFuZ2VkID09PSB0cnVlIHx8XG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHF1ZXJ5RGVmaW5pdGlvbi5saXN0ZW4uY2hhbmdlZCkpO1xuXG4gICAgICAgIGlmIChqc29uUXVlcnkucmVhY3RpdmUpIHtcbiAgICAgICAgICBqc29uUXVlcnkubGlzdGVuID0ge307XG5cbiAgICAgICAgICBjb25zdCBtZXRob2RzID0gW1wiYWRkZWRcIiwgXCJyZW1vdmVkXCIsIFwiY2hhbmdlZFwiXTtcbiAgICAgICAgICBtZXRob2RzLmZvckVhY2goKG1ldGhvZCkgPT4ge1xuICAgICAgICAgICAgaWYgKHF1ZXJ5W21ldGhvZF0pIHtcbiAgICAgICAgICAgICAganNvblF1ZXJ5Lmxpc3RlblttZXRob2RdID0ge1xuICAgICAgICAgICAgICAgIGVudGl0aWVzOiBxdWVyeVttZXRob2RdLmxlbmd0aCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBqc29uO1xuICB9XG59XG5cblN5c3RlbS5pc1N5c3RlbSA9IHRydWU7XG5TeXN0ZW0uZ2V0TmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGlzcGxheU5hbWUgfHwgdGhpcy5uYW1lO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIE5vdChDb21wb25lbnQpIHtcbiAgcmV0dXJuIHtcbiAgICBvcGVyYXRvcjogXCJub3RcIixcbiAgICBDb21wb25lbnQ6IENvbXBvbmVudCxcbiAgfTtcbn1cbiIsImltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gXCIuL0NvbXBvbmVudC5qc1wiO1xuXG5leHBvcnQgY2xhc3MgVGFnQ29tcG9uZW50IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoZmFsc2UpO1xuICB9XG59XG5cblRhZ0NvbXBvbmVudC5pc1RhZ0NvbXBvbmVudCA9IHRydWU7XG4iLCJleHBvcnQgY29uc3QgY29weVZhbHVlID0gKHNyYykgPT4gc3JjO1xuXG5leHBvcnQgY29uc3QgY2xvbmVWYWx1ZSA9IChzcmMpID0+IHNyYztcblxuZXhwb3J0IGNvbnN0IGNvcHlBcnJheSA9IChzcmMsIGRlc3QpID0+IHtcbiAgaWYgKCFzcmMpIHtcbiAgICByZXR1cm4gc3JjO1xuICB9XG5cbiAgaWYgKCFkZXN0KSB7XG4gICAgcmV0dXJuIHNyYy5zbGljZSgpO1xuICB9XG5cbiAgZGVzdC5sZW5ndGggPSAwO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3JjLmxlbmd0aDsgaSsrKSB7XG4gICAgZGVzdC5wdXNoKHNyY1tpXSk7XG4gIH1cblxuICByZXR1cm4gZGVzdDtcbn07XG5cbmV4cG9ydCBjb25zdCBjbG9uZUFycmF5ID0gKHNyYykgPT4gc3JjICYmIHNyYy5zbGljZSgpO1xuXG5leHBvcnQgY29uc3QgY29weUpTT04gPSAoc3JjKSA9PiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHNyYykpO1xuXG5leHBvcnQgY29uc3QgY2xvbmVKU09OID0gKHNyYykgPT4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShzcmMpKTtcblxuZXhwb3J0IGNvbnN0IGNvcHlDb3B5YWJsZSA9IChzcmMsIGRlc3QpID0+IHtcbiAgaWYgKCFzcmMpIHtcbiAgICByZXR1cm4gc3JjO1xuICB9XG5cbiAgaWYgKCFkZXN0KSB7XG4gICAgcmV0dXJuIHNyYy5jbG9uZSgpO1xuICB9XG5cbiAgcmV0dXJuIGRlc3QuY29weShzcmMpO1xufTtcblxuZXhwb3J0IGNvbnN0IGNsb25lQ2xvbmFibGUgPSAoc3JjKSA9PiBzcmMgJiYgc3JjLmNsb25lKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUeXBlKHR5cGVEZWZpbml0aW9uKSB7XG4gIHZhciBtYW5kYXRvcnlQcm9wZXJ0aWVzID0gW1wibmFtZVwiLCBcImRlZmF1bHRcIiwgXCJjb3B5XCIsIFwiY2xvbmVcIl07XG5cbiAgdmFyIHVuZGVmaW5lZFByb3BlcnRpZXMgPSBtYW5kYXRvcnlQcm9wZXJ0aWVzLmZpbHRlcigocCkgPT4ge1xuICAgIHJldHVybiAhdHlwZURlZmluaXRpb24uaGFzT3duUHJvcGVydHkocCk7XG4gIH0pO1xuXG4gIGlmICh1bmRlZmluZWRQcm9wZXJ0aWVzLmxlbmd0aCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgY3JlYXRlVHlwZSBleHBlY3RzIGEgdHlwZSBkZWZpbml0aW9uIHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOiAke3VuZGVmaW5lZFByb3BlcnRpZXMuam9pbihcbiAgICAgICAgXCIsIFwiXG4gICAgICApfWBcbiAgICApO1xuICB9XG5cbiAgdHlwZURlZmluaXRpb24uaXNUeXBlID0gdHJ1ZTtcblxuICByZXR1cm4gdHlwZURlZmluaXRpb247XG59XG5cbi8qKlxuICogU3RhbmRhcmQgdHlwZXNcbiAqL1xuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBOdW1iZXI6IGNyZWF0ZVR5cGUoe1xuICAgIG5hbWU6IFwiTnVtYmVyXCIsXG4gICAgZGVmYXVsdDogMCxcbiAgICBjb3B5OiBjb3B5VmFsdWUsXG4gICAgY2xvbmU6IGNsb25lVmFsdWUsXG4gIH0pLFxuXG4gIEJvb2xlYW46IGNyZWF0ZVR5cGUoe1xuICAgIG5hbWU6IFwiQm9vbGVhblwiLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGNvcHk6IGNvcHlWYWx1ZSxcbiAgICBjbG9uZTogY2xvbmVWYWx1ZSxcbiAgfSksXG5cbiAgU3RyaW5nOiBjcmVhdGVUeXBlKHtcbiAgICBuYW1lOiBcIlN0cmluZ1wiLFxuICAgIGRlZmF1bHQ6IFwiXCIsXG4gICAgY29weTogY29weVZhbHVlLFxuICAgIGNsb25lOiBjbG9uZVZhbHVlLFxuICB9KSxcblxuICBBcnJheTogY3JlYXRlVHlwZSh7XG4gICAgbmFtZTogXCJBcnJheVwiLFxuICAgIGRlZmF1bHQ6IFtdLFxuICAgIGNvcHk6IGNvcHlBcnJheSxcbiAgICBjbG9uZTogY2xvbmVBcnJheSxcbiAgfSksXG5cbiAgUmVmOiBjcmVhdGVUeXBlKHtcbiAgICBuYW1lOiBcIlJlZlwiLFxuICAgIGRlZmF1bHQ6IHVuZGVmaW5lZCxcbiAgICBjb3B5OiBjb3B5VmFsdWUsXG4gICAgY2xvbmU6IGNsb25lVmFsdWUsXG4gIH0pLFxuXG4gIEpTT046IGNyZWF0ZVR5cGUoe1xuICAgIG5hbWU6IFwiSlNPTlwiLFxuICAgIGRlZmF1bHQ6IG51bGwsXG4gICAgY29weTogY29weUpTT04sXG4gICAgY2xvbmU6IGNsb25lSlNPTixcbiAgfSksXG59O1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlSWQobGVuZ3RoKSB7XG4gIHZhciByZXN1bHQgPSBcIlwiO1xuICB2YXIgY2hhcmFjdGVycyA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5XCI7XG4gIHZhciBjaGFyYWN0ZXJzTGVuZ3RoID0gY2hhcmFjdGVycy5sZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICByZXN1bHQgKz0gY2hhcmFjdGVycy5jaGFyQXQoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogY2hhcmFjdGVyc0xlbmd0aCkpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbmplY3RTY3JpcHQoc3JjLCBvbkxvYWQpIHtcbiAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XG4gIC8vIEB0b2RvIFVzZSBsaW5rIHRvIHRoZSBlY3N5LWRldnRvb2xzIHJlcG8/XG4gIHNjcmlwdC5zcmMgPSBzcmM7XG4gIHNjcmlwdC5vbmxvYWQgPSBvbkxvYWQ7XG4gIChkb2N1bWVudC5oZWFkIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcbn1cbiIsIi8qIGdsb2JhbCBQZWVyICovXG5pbXBvcnQgeyBpbmplY3RTY3JpcHQsIGdlbmVyYXRlSWQgfSBmcm9tIFwiLi91dGlscy5qc1wiO1xuaW1wb3J0IHsgaGFzV2luZG93IH0gZnJvbSBcIi4uL1V0aWxzLmpzXCI7XG5cbmZ1bmN0aW9uIGhvb2tDb25zb2xlQW5kRXJyb3JzKGNvbm5lY3Rpb24pIHtcbiAgdmFyIHdyYXBGdW5jdGlvbnMgPSBbXCJlcnJvclwiLCBcIndhcm5pbmdcIiwgXCJsb2dcIl07XG4gIHdyYXBGdW5jdGlvbnMuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiBjb25zb2xlW2tleV0gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgdmFyIGZuID0gY29uc29sZVtrZXldLmJpbmQoY29uc29sZSk7XG4gICAgICBjb25zb2xlW2tleV0gPSAoLi4uYXJncykgPT4ge1xuICAgICAgICBjb25uZWN0aW9uLnNlbmQoe1xuICAgICAgICAgIG1ldGhvZDogXCJjb25zb2xlXCIsXG4gICAgICAgICAgdHlwZToga2V5LFxuICAgICAgICAgIGFyZ3M6IEpTT04uc3RyaW5naWZ5KGFyZ3MpLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGZuLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgfTtcbiAgICB9XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgKGVycm9yKSA9PiB7XG4gICAgY29ubmVjdGlvbi5zZW5kKHtcbiAgICAgIG1ldGhvZDogXCJlcnJvclwiLFxuICAgICAgZXJyb3I6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogZXJyb3IuZXJyb3IubWVzc2FnZSxcbiAgICAgICAgc3RhY2s6IGVycm9yLmVycm9yLnN0YWNrLFxuICAgICAgfSksXG4gICAgfSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBpbmNsdWRlUmVtb3RlSWRIVE1MKHJlbW90ZUlkKSB7XG4gIGxldCBpbmZvRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaW5mb0Rpdi5zdHlsZS5jc3NUZXh0ID0gYFxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogIzMzMztcbiAgICBjb2xvcjogI2FhYTtcbiAgICBkaXNwbGF5OmZsZXg7XG4gICAgZm9udC1mYW1pbHk6IEFyaWFsO1xuICAgIGZvbnQtc2l6ZTogMS4xZW07XG4gICAgaGVpZ2h0OiA0MHB4O1xuICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgIGxlZnQ6IDA7XG4gICAgb3BhY2l0eTogMC45O1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICByaWdodDogMDtcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgdG9wOiAwO1xuICBgO1xuXG4gIGluZm9EaXYuaW5uZXJIVE1MID0gYE9wZW4gRUNTWSBkZXZ0b29scyB0byBjb25uZWN0IHRvIHRoaXMgcGFnZSB1c2luZyB0aGUgY29kZTombmJzcDs8YiBzdHlsZT1cImNvbG9yOiAjZmZmXCI+JHtyZW1vdGVJZH08L2I+Jm5ic3A7PGJ1dHRvbiBvbkNsaWNrPVwiZ2VuZXJhdGVOZXdDb2RlKClcIj5HZW5lcmF0ZSBuZXcgY29kZTwvYnV0dG9uPmA7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaW5mb0Rpdik7XG5cbiAgcmV0dXJuIGluZm9EaXY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmFibGVSZW1vdGVEZXZ0b29scyhyZW1vdGVJZCkge1xuICBpZiAoIWhhc1dpbmRvdykge1xuICAgIGNvbnNvbGUud2FybihcIlJlbW90ZSBkZXZ0b29scyBub3QgYXZhaWxhYmxlIG91dHNpZGUgdGhlIGJyb3dzZXJcIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgd2luZG93LmdlbmVyYXRlTmV3Q29kZSA9ICgpID0+IHtcbiAgICB3aW5kb3cubG9jYWxTdG9yYWdlLmNsZWFyKCk7XG4gICAgcmVtb3RlSWQgPSBnZW5lcmF0ZUlkKDYpO1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShcImVjc3lSZW1vdGVJZFwiLCByZW1vdGVJZCk7XG4gICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZChmYWxzZSk7XG4gIH07XG5cbiAgcmVtb3RlSWQgPSByZW1vdGVJZCB8fCB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJlY3N5UmVtb3RlSWRcIik7XG4gIGlmICghcmVtb3RlSWQpIHtcbiAgICByZW1vdGVJZCA9IGdlbmVyYXRlSWQoNik7XG4gICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiZWNzeVJlbW90ZUlkXCIsIHJlbW90ZUlkKTtcbiAgfVxuXG4gIGxldCBpbmZvRGl2ID0gaW5jbHVkZVJlbW90ZUlkSFRNTChyZW1vdGVJZCk7XG5cbiAgd2luZG93Ll9fRUNTWV9SRU1PVEVfREVWVE9PTFNfSU5KRUNURUQgPSB0cnVlO1xuICB3aW5kb3cuX19FQ1NZX1JFTU9URV9ERVZUT09MUyA9IHt9O1xuXG4gIGxldCBWZXJzaW9uID0gXCJcIjtcblxuICAvLyBUaGlzIGlzIHVzZWQgdG8gY29sbGVjdCB0aGUgd29ybGRzIGNyZWF0ZWQgYmVmb3JlIHRoZSBjb21tdW5pY2F0aW9uIGlzIGJlaW5nIGVzdGFibGlzaGVkXG4gIGxldCB3b3JsZHNCZWZvcmVMb2FkaW5nID0gW107XG4gIGxldCBvbldvcmxkQ3JlYXRlZCA9IChlKSA9PiB7XG4gICAgdmFyIHdvcmxkID0gZS5kZXRhaWwud29ybGQ7XG4gICAgVmVyc2lvbiA9IGUuZGV0YWlsLnZlcnNpb247XG4gICAgd29ybGRzQmVmb3JlTG9hZGluZy5wdXNoKHdvcmxkKTtcbiAgfTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJlY3N5LXdvcmxkLWNyZWF0ZWRcIiwgb25Xb3JsZENyZWF0ZWQpO1xuXG4gIGxldCBvbkxvYWRlZCA9ICgpID0+IHtcbiAgICAvLyB2YXIgcGVlciA9IG5ldyBQZWVyKHJlbW90ZUlkKTtcbiAgICB2YXIgcGVlciA9IG5ldyBQZWVyKHJlbW90ZUlkLCB7XG4gICAgICBob3N0OiBcInBlZXJqcy5lY3N5LmlvXCIsXG4gICAgICBzZWN1cmU6IHRydWUsXG4gICAgICBwb3J0OiA0NDMsXG4gICAgICBjb25maWc6IHtcbiAgICAgICAgaWNlU2VydmVyczogW1xuICAgICAgICAgIHsgdXJsOiBcInN0dW46c3R1bi5sLmdvb2dsZS5jb206MTkzMDJcIiB9LFxuICAgICAgICAgIHsgdXJsOiBcInN0dW46c3R1bjEubC5nb29nbGUuY29tOjE5MzAyXCIgfSxcbiAgICAgICAgICB7IHVybDogXCJzdHVuOnN0dW4yLmwuZ29vZ2xlLmNvbToxOTMwMlwiIH0sXG4gICAgICAgICAgeyB1cmw6IFwic3R1bjpzdHVuMy5sLmdvb2dsZS5jb206MTkzMDJcIiB9LFxuICAgICAgICAgIHsgdXJsOiBcInN0dW46c3R1bjQubC5nb29nbGUuY29tOjE5MzAyXCIgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICBkZWJ1ZzogMyxcbiAgICB9KTtcblxuICAgIHBlZXIub24oXCJvcGVuXCIsICgvKiBpZCAqLykgPT4ge1xuICAgICAgcGVlci5vbihcImNvbm5lY3Rpb25cIiwgKGNvbm5lY3Rpb24pID0+IHtcbiAgICAgICAgd2luZG93Ll9fRUNTWV9SRU1PVEVfREVWVE9PTFMuY29ubmVjdGlvbiA9IGNvbm5lY3Rpb247XG4gICAgICAgIGNvbm5lY3Rpb24ub24oXCJvcGVuXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAvLyBpbmZvRGl2LnN0eWxlLnZpc2liaWxpdHkgPSBcImhpZGRlblwiO1xuICAgICAgICAgIGluZm9EaXYuaW5uZXJIVE1MID0gXCJDb25uZWN0ZWRcIjtcblxuICAgICAgICAgIC8vIFJlY2VpdmUgbWVzc2FnZXNcbiAgICAgICAgICBjb25uZWN0aW9uLm9uKFwiZGF0YVwiLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgaWYgKGRhdGEudHlwZSA9PT0gXCJpbml0XCIpIHtcbiAgICAgICAgICAgICAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XG4gICAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC9qYXZhc2NyaXB0XCIpO1xuICAgICAgICAgICAgICBzY3JpcHQub25sb2FkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHNjcmlwdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHNjcmlwdCk7XG5cbiAgICAgICAgICAgICAgICAvLyBPbmNlIHRoZSBzY3JpcHQgaXMgaW5qZWN0ZWQgd2UgZG9uJ3QgbmVlZCB0byBsaXN0ZW5cbiAgICAgICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgICAgICAgICAgIFwiZWNzeS13b3JsZC1jcmVhdGVkXCIsXG4gICAgICAgICAgICAgICAgICBvbldvcmxkQ3JlYXRlZFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgd29ybGRzQmVmb3JlTG9hZGluZy5mb3JFYWNoKCh3b3JsZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgdmFyIGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KFwiZWNzeS13b3JsZC1jcmVhdGVkXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiB7IHdvcmxkOiB3b3JsZCwgdmVyc2lvbjogVmVyc2lvbiB9LFxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChldmVudCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIHNjcmlwdC5pbm5lckhUTUwgPSBkYXRhLnNjcmlwdDtcbiAgICAgICAgICAgICAgKGRvY3VtZW50LmhlYWQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChzY3JpcHQpO1xuICAgICAgICAgICAgICBzY3JpcHQub25sb2FkKCk7XG5cbiAgICAgICAgICAgICAgaG9va0NvbnNvbGVBbmRFcnJvcnMoY29ubmVjdGlvbik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEudHlwZSA9PT0gXCJleGVjdXRlU2NyaXB0XCIpIHtcbiAgICAgICAgICAgICAgbGV0IHZhbHVlID0gZXZhbChkYXRhLnNjcmlwdCk7XG4gICAgICAgICAgICAgIGlmIChkYXRhLnJldHVybkV2YWwpIHtcbiAgICAgICAgICAgICAgICBjb25uZWN0aW9uLnNlbmQoe1xuICAgICAgICAgICAgICAgICAgbWV0aG9kOiBcImV2YWxSZXR1cm5cIixcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEluamVjdCBQZWVySlMgc2NyaXB0XG4gIGluamVjdFNjcmlwdChcbiAgICBcImh0dHBzOi8vY2RuLmpzZGVsaXZyLm5ldC9ucG0vcGVlcmpzQDAuMy4yMC9kaXN0L3BlZXIubWluLmpzXCIsXG4gICAgb25Mb2FkZWRcbiAgKTtcbn1cblxuaWYgKGhhc1dpbmRvdykge1xuICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuXG4gIC8vIEB0b2RvIFByb3ZpZGUgYSB3YXkgdG8gZGlzYWJsZSBpdCBpZiBuZWVkZWRcbiAgaWYgKHVybFBhcmFtcy5oYXMoXCJlbmFibGUtcmVtb3RlLWRldnRvb2xzXCIpKSB7XG4gICAgZW5hYmxlUmVtb3RlRGV2dG9vbHMoKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0NBQUE7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtBQWFBO0NBQ0E7Q0FDQTtDQUNBO0NBQ0E7Q0FDQTtDQUNPLFNBQVMsUUFBUSxDQUFDLFVBQVUsRUFBRTtDQUNyQyxFQUFFLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztDQUNmLEVBQUUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Q0FDOUMsSUFBSSxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDMUI7Q0FDQSxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRTtDQUNqQyxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxzREFBc0QsQ0FBQyxDQUFDLENBQUM7Q0FDaEYsS0FBSztBQUNMO0NBQ0EsSUFBSSxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVEsRUFBRTtDQUMvQixNQUFNLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQyxRQUFRLEtBQUssS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDO0NBQzdELE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztDQUMvQyxLQUFL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
