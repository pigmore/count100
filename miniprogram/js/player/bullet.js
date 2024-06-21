import Sprite from '../base/sprite'
import DataBus from '../databus'

const BULLET_IMG_SRC = 'images/bullet.png'
const BULLET_WIDTH = 16
const BULLET_HEIGHT = 30
const screenWidth = window.innerWidth
const screenHeight = window.innerHeight

// const __ = {
//   speed: Symbol('speed'),
//   dx: Symbol('dx'),
//   dy: Symbol('dy')
// }

const databus = new DataBus()

export default class Bullet extends Sprite {
  constructor() {
    super(BULLET_IMG_SRC, BULLET_WIDTH, BULLET_HEIGHT)
    this.rotateDegree = 0
    this.dx = 0
    this.dy = 0
    this.count = 0
  }

  init(x, y, speed,rotateDegree) {
    this.x = x
    this.y = y
    this.count = 0
    this.rotateDegree = rotateDegree

    // this[__.speed] = speed
    this.dx = speed * Math.cos(Math.PI * (rotateDegree - 90) / 180 )
    this.dy = speed * Math.sin(Math.PI * (rotateDegree - 90) / 180 )

    this.visible = true
  }

  // 每一帧更新子弹位置
  update() {

    this.x += this.dx
    this.y += this.dy
    this.count += 1
    // 超出屏幕外回收自身
    if (this.count > 300) databus.removeBullets(this)
  }
  drawToCanvas(ctx){
    if (!this.visible) return

    ctx.save()
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    ctx.rotate(this.rotateDegree * Math.PI / 180)
    // ctx.rotate(0)

    ctx.drawImage(
      this.img,
      - this.width / 2,
      - this.height / 2,
      this.width,
      this.height
    )
    // ctx.translate(-this.x - this.width / 2, -this.y - this.height / 2);
    ctx.restore()
  }
}
