import Pool from './base/pool'

let instance

/**
 * 全局状态管理器
 */
export default class DataBus {
  constructor() {
    if (instance) return instance

    instance = this

    this.pool = new Pool()



    this.reset()


    wx.startAccelerometer(
      ({
        interval: 'game'
      })
    );
    wx.onAccelerometerChange( (res) => {
      if(this.paddleDX * res.x < 0) {
        this.paddleDX += res.x * 3
      }else{
        this.paddleDX += res.x * 1.5
      }
      if(this.paddleDY * res.y > 0) {
        this.paddleDY -= res.y * 3
      }else{
        this.paddleDY -= res.y * 1.5
      }


    })
  }

  reset() {
    this.frame = 0
    this.score = 0
    this.paddleDX = 0
    this.paddleDY = 1
    this.rotateDegree = 0
    this.bullets = []
    this.enemys = []
    this.animations = []
    this.gameOver = false
    // wx.startAccelerometer();
    // wx.onAccelerometerChange( (res) => {
    //   if(this.paddleDX * res.x < 0) {
    //     this.paddleDX += res.x * 3
    //   }else{
    //     this.paddleDX += res.x * 1.5
    //   }
    //   if(this.paddleDY * res.y > 0) {
    //     this.paddleDY -= res.y * 3
    //   }else{
    //     this.paddleDY -= res.y * 1.5
    //   }
    //
    //
    // })
  }

  /**
   * 回收敌人，进入对象池
   * 此后不进入帧循环
   */
  removeEnemey(enemy) {
    const temp = this.enemys.shift()

    temp.visible = false

    this.pool.recover('enemy', enemy)
  }

  /**
   * 回收子弹，进入对象池
   * 此后不进入帧循环
   */
  removeBullets(bullet) {
    const temp = this.bullets.shift()

    temp.visible = false

    this.pool.recover('bullet', bullet)
  }
}
