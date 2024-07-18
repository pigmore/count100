import { Component, Types } from "../build/ecsy.module.js";
import { Vector2Type } from "./math.js";

export class Particle extends Component {}
Particle.schema = {
  position: { type: Vector2Type },
  color: { type: Types.String },
  // size: { type: Vector2Type },
  count: { type: Types.Number, default: 0},
  // rotate: { type: Types.Number, default: 0},
  // height: { type: Types.Number, default: 0},
};
export class Firework extends Component {}
Firework.schema = {
  position: { type: Vector2Type },
  color: { type: Types.String },
  // size: { type: Vector2Type },
  count: { type: Types.Number, default: 0},
  rotate: { type: Types.Number, default: 0},
  type: { type: Types.Number, default: 0},
};

export class Confetti extends Component {}
Confetti.schema = {
  position: { type: Vector2Type },
  color: { type: Types.String },
  // size: { type: Vector2Type },
  count: { type: Types.Number, default: 0},
  rotate: { type: Types.Number, default: 0},
  height: { type: Types.Number, default: 0},
};

export class Texts extends Component {}
Texts.schema = {
  position: { type: Vector2Type },
  id: { type: Types.String },
  text: { type: Types.String, default:"+1" },
  count: { type: Types.Number },
  size: { type: Types.Number, default:24},
  color: { type: Types.String },
  isTime: { type: Types.Boolean, default:false},
  isLeft: { type: Types.Boolean, default:false},
  isinClip:{type: Types.Boolean, default:false}
  // playerImg: { type: Types.String }
  // velocity: { type: Vector2Type },
  // acceleration: { type: Vector2Type },
};

export class Button extends Component {}
Button.schema = {
  position: { type: Vector2Type },
  size: { type: Vector2Type },
  isBase: { type: Types.Boolean, default: false},
  text:{type: Types.String, default:'+'}
};

export class Player extends Component {}
Player.schema = {
  position: { type: Vector2Type },
  radius: { type: Types.Number },
  health: { type: Types.Number , default:3},
  isOverWhelming: { type: Types.Number , default:0},
  isHolding: { type: Types.Boolean, default: false},
  playerImg: { type: Types.JSON },
  isInit:{type: Types.Number , default:-1},
  isFinish:{type: Types.Number , default:1}
  // velocity: { type: Vector2Type },
  // acceleration: { type: Vector2Type },
};

export class Movement extends Component {}

Movement.schema = {
  velocity: { type: Vector2Type },
  acceleration: { type: Vector2Type },
};

export class Circle extends Component {}

Circle.schema = {
  position: { type: Vector2Type },
  radius: { type: Types.Number },
  velocity: { type: Vector2Type },
  acceleration: { type: Vector2Type },
};

export class CanvasContext extends Component {}

CanvasContext.schema = {
  ctx: { type: Types.Ref },
  width: { type: Types.Number },
  height: { type: Types.Number },
};

export class DemoSettings extends Component {}

DemoSettings.schema = {
  speedMultiplier: { type: Types.Number, default: 0.08 },
};

export class Intersecting extends Component {}

Intersecting.schema = {
  points: { type: Types.Array },
};
