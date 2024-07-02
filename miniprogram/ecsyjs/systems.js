import { System } from "../build/ecsy.module.js";
import {
  CanvasContext,
  DemoSettings,
  Movement,
  Circle,
  Button,
  Intersecting,
} from "./components.js";
import { fillCircle, drawLine, intersection,
  drawRoundedRect
 } from "./utils.js";

export class MovementSystem extends System {
  execute(delta) {
    var context = this.queries.context.results[0];
    let canvasWidth = context.getComponent(CanvasContext).width;
    let canvasHeight = context.getComponent(CanvasContext).height;
    let multiplier = context.getComponent(DemoSettings).speedMultiplier;

    let entities = this.queries.entities.results;
    for (var i = 0; i < entities.length; i++) {
      let entity = entities[i];
      let circle = entity.getMutableComponent(Circle);
      let movement = entity.getMutableComponent(Movement);



      if (movement.acceleration.x > 1)
        movement.acceleration.x -= delta * multiplier;
      if (movement.acceleration.y > 1)
        movement.acceleration.y -= delta * multiplier;
      if (movement.acceleration.x < 1) movement.acceleration.x = 1;
      if (movement.acceleration.y < 1) movement.acceleration.y = 1;

      if (circle.position.y - circle.radius < 0)
        // circle.position.y = canvasHeight + circle.radius;
        // circle.position.y = circle.radius + 10;
        movement.velocity.y = Math.abs(movement.velocity.y)

      if (circle.position.y + circle.radius > canvasHeight)
        // circle.position.y = canvasHeight - circle.radius - 10;
        // circle.position.y = -circle.radius;
        movement.velocity.y = - Math.abs(movement.velocity.y)

      if (circle.position.x + circle.radius > canvasWidth)
        // circle.position.x = 0;
        // circle.position.x = canvasWidth - circle.radius - 10;
        movement.velocity.x = - Math.abs(movement.velocity.x)

      if (circle.position.x - circle.radius < 0)
        // circle.position.x = canvasWidth;
        // circle.position.x = circle.radius + 10;
        movement.velocity.x = Math.abs(movement.velocity.x)

      circle.position.x +=
        movement.velocity.x * movement.acceleration.x * delta * multiplier;
      circle.position.y +=
        movement.velocity.y * movement.acceleration.y * delta * multiplier;
    }
  }
}

MovementSystem.queries = {
  entities: { components: [Circle, Movement] },
  context: { components: [CanvasContext, DemoSettings], mandatory: true },
};

export class IntersectionSystem extends System {
  execute(delta) {
    var context = this.queries.context.results[0];
    let multiplier = context.getComponent(DemoSettings).speedMultiplier;
    let entities = this.queries.entities.results;

    for (var i = 0; i < entities.length; i++) {
      let entity = entities[i];
      // let entity = entities[i];
      // let circle = entity.getMutableComponent(Circle);
      let movement = entity.getMutableComponent(Movement);
      if (entity.hasComponent(Intersecting)) {
        entity.getMutableComponent(Intersecting).points.length = 0;
      }

      let circle = entity.getComponent(Circle);

      for (var j = i + 1; j < entities.length; j++) {
        let entityB = entities[j];
        let circleB = entityB.getComponent(Circle);
        let movementB = entityB.getMutableComponent(Movement);
        var intersect = intersection(circle, circleB);
        if (intersect !== false) {

          // var fzx=(circle.radius - circleB.radius)*movement.velocity.x + 2*circleB.radius*movementB.velocity.x;
          // var fzx2=2*circle.radius*movement.velocity.x+(circle.radius - circleB.radius)*movementB.velocity.x;
          // var fzy=(circle.radius - circleB.radius)*movement.velocity.y + 2*circleB.radius*movementB.velocity.y;
          // var fzy2=2*circle.radius*movement.velocity.y+(circle.radius - circleB.radius)*movementB.velocity.y;
          // var fm=circle.radius + circleB.radius;

          // balls[i].speedX=(fzx/fm);
          // balls[i].speedY=(fzy/fm);
          // balls[j].speedX=(fzx2/fm);
          // balls[j].speedY=(fzy2/fm);circle.position.x +=
          // circleB.position.x -=
          //   movementB.velocity.x * movementB.acceleration.x * delta * multiplier;
          // circleB.position.y -=
          //   movementB.velocity.y * movementB.acceleration.y * delta * multiplier;

            movement.velocity.x -= intersect[4] / multiplier
            movement.velocity.y -= intersect[5] / multiplier
          movementB.velocity.x += intersect[4] / multiplier
          movementB.velocity.y += intersect[5] / multiplier



          var intersectComponent;
          if (!entity.hasComponent(Intersecting)) {
            entity.addComponent(Intersecting);
          }
          intersectComponent = entity.getMutableComponent(Intersecting);
          intersectComponent.points.push(intersect);



        }
      }
      if (
        entity.hasComponent(Intersecting) &&
        entity.getComponent(Intersecting).points.length === 0
      ) {
        entity.removeComponent(Intersecting);
      }
    }
  }

  stop() {
    super.stop();
    // Clean up interesection when stopping
    let entities = this.queries.entities;

    for (var i = 0; i < entities.length; i++) {
      let entity = entities[i];
      if (entity.hasComponent(Intersecting)) {
        entity.getMutableComponent(Intersecting).points.length = 0;
      }
    }
  }
}

IntersectionSystem.queries = {
  entities: { components: [Circle] },
  context: { components: [CanvasContext, DemoSettings], mandatory: true },
};

export class Renderer extends System {
  execute() {
    var context = this.queries.context.results[0];
    let canvasComponent = context.getComponent(CanvasContext);
    let ctx = canvasComponent.ctx;
    let canvasWidth = canvasComponent.width;
    let canvasHeight = canvasComponent.height;
    ctx.restore()
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.save()

    let buttons = this.queries.buttons.results;
    ctx.strokeStyle = 'black';
    ctx.fillStyle = "#42A767";
    ctx.lineWidth = 7;

    for (var i = 0; i < buttons.length; i++) {
      let button = buttons[i].getComponent(Button);

      drawRoundedRect(ctx,
        button.position.x,
         button.position.y,
          button.size.x,
           button.size.y,
            15)
      }
  }
}

Renderer.queries = {
  circles: { components: [Circle] },
  buttons: { components: [Button] },
  intersectingCircles: { components: [Intersecting] },
  context: { components: [CanvasContext], mandatory: true },
};
