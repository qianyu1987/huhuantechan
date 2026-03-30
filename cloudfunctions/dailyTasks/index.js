// cloudfunctions/dailyTasks/index.js
// 每日定时任务云函数
// 触发器：定时触发（建议每2小时执行一次）
// 功能：
//   1. 代购订单 pending_shipment 超过 48h → 自动取消（退还积分 + 恢复库存）
//   2. 代购订单 shipped 超过 14天 → 自动确认收货（奖励积分）
//   3. 签到连续奖励检查（原有逻辑保留扩展位）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ── 常量（与 daigouMgr 保持一致）──
const CANCEL_TIMEOUT_HOURS  = 48   // pending_shipment 超时取消（小时）
const AUTO_CONFIRM_DAYS     = 14   // shipped 后自动确认收货（天）
const BUYER_REWARD_RATE     = 0.05 // 买家完成订单积分奖励比例
const BUYER_REWARD_MIN      = 5    // 买家奖励积分下限
const SELLER_REWARD_POINTS  = 20   // 卖家每笔完成固定奖励积分
const POINTS_TO_YUAN        = 100  // 100积分 = 1元

// ── 工具：查找用户 _id ──
async function findUserDocId(openid) {
  if (!openid) return null
  try {
    const res = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()
    return res.data && res.data[0] ? res.data[0]._id : null
  } catch (e) {
    return null
  }
}

// ── 工具：记录积分日志 ──
async function addPointsLog(openid, type, amount, desc, orderId) {
  try {
    await db.collection('points_log').add({
      data: {
        _openid: openid,
        type,
        amount,
        desc,
        orderId,
        createTime: db.serverDate()
      }
    })
  } catch (e) {
    console.warn('[dailyTasks] addPointsLog failed:', e.message)
  }
}

// ═══════════════════════════════════════════════════
// 任务1：自动取消 confirmed 超时订单（72h）
// ═══════════════════════════════════════════════════
async function autoCancelConfirmedOrders() {
  const result = { processed: 0, cancelled: 0, errors: 0 }
  const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000)

  try {
    // 查询所有已确认且创建时间超过72h的订单
    const res = await db.collection('swapOrders')
      .where({
        status: 'confirmed',
        createTime: _.lt(new Date(cutoffTime))
      })
      .limit(100)
      .get()

    const orders = res.data || []
    result.processed = orders.length
    console.log(`[dailyTasks/autoCancelConfirmed] found ${orders.length} orders to check`)

    for (const order of orders) {
      try {
        // 标记订单为已取消
        await db.collection('swapOrders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelBy: 'system',
            cancelReason: '超过72小时未完成互换，系统自动取消',
            cancelTime: db.serverDate(),
            autoCancel: true,
            updateTime: db.serverDate()
          }
        })

        // 退还双方积分
        const pointsToRefund = order.pointsUsed || 0
        if (pointsToRefund > 0) {
          // 退还发起方积分
          const initiatorDocId = await findUserDocId(order.initiatorOpenid)
          if (initiatorDocId) {
            await db.collection('users').doc(initiatorDocId).update({
              data: { points: _.inc(pointsToRefund), updateTime: db.serverDate() }
            })
            await addPointsLog(
              order.initiatorOpenid,
              'swap_timeout_cancel_refund',
              pointsToRefund,
              `互换订单超时自动取消退还积分：${order.productName || '特产'}（单号 ${order.orderNo || order._id}）`,
              order._id
            )
          }

          // 退还接收方积分
          const receiverDocId = await findUserDocId(order.receiverOpenid)
          if (receiverDocId) {
            await db.collection('users').doc(receiverDocId).update({
              data: { points: _.inc(pointsToRefund), updateTime: db.serverDate() }
            })
            await addPointsLog(
              order.receiverOpenid,
              'swap_timeout_cancel_refund',
              pointsToRefund,
              `互换订单超时自动取消退还积分：${order.productName || '特产'}（单号 ${order.orderNo || order._id}）`,
              order._id
            )
          }
        }

        result.cancelled++
        console.log(`[dailyTasks/autoCancelConfirmed] cancelled order ${order._id}`)
      } catch (e) {
        result.errors++
        console.error(`[dailyTasks/autoCancelConfirmed] failed for order ${order._id}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[dailyTasks/autoCancelConfirmed]', e)
    result.errors++
  }

  return result
}

// ═══════════════════════════════════════════════════
// 任务2：自动取消 pending_shipment 超时订单（48h）
// ═══════════════════════════════════════════════════
async function autoCancelTimeoutOrders() {
  const result = { processed: 0, cancelled: 0, errors: 0 }
  const cutoffTime = new Date(Date.now() - CANCEL_TIMEOUT_HOURS * 60 * 60 * 1000)

  try {
    // 查询所有待发货且创建时间超过48h的订单
    const res = await db.collection('daigouOrders')
      .where({
        status: 'pending_shipment',
        createTime: _.lt(new Date(cutoffTime))
      })
      .limit(100)
      .get()

    const orders = res.data || []
    result.processed = orders.length
    console.log(`[dailyTasks/autoCancelTimeout] found ${orders.length} orders to check`)

    for (const order of orders) {
      try {
        // 标记订单为已取消
        await db.collection('daigouOrders').doc(order._id).update({
          data: {
            status: 'cancelled',
            cancelBy: 'system',
            cancelReason: '超过48小时未发货，系统自动取消',
            cancelTime: db.serverDate(),
            autoCancel: true,
            updateTime: db.serverDate()
          }
        })

        // 恢复库存
        try {
          await db.collection('products').doc(order.productId).update({
            data: { 'daigou.stock': _.inc(1), updateTime: db.serverDate() }
          })
          const pRes = await db.collection('products').doc(order.productId).get()
          if (pRes.data && pRes.data.daigou && pRes.data.daigou.soldCount > 0) {
            await db.collection('products').doc(order.productId).update({
              data: { 'daigou.soldCount': _.inc(-1) }
            })
          }
        } catch (e) {
          console.warn(`[dailyTasks/autoCancelTimeout] restore stock failed for ${order._id}:`, e.message)
        }

        // 退还买家积分
        const refundPoints = order.pointsUsed || 0
        if (refundPoints > 0) {
          const buyerDocId = await findUserDocId(order.buyerOpenid)
          if (buyerDocId) {
            await db.collection('users').doc(buyerDocId).update({
              data: { points: _.inc(refundPoints), updateTime: db.serverDate() }
            })
            await addPointsLog(
              order.buyerOpenid,
              'daigou_timeout_cancel_refund',
              refundPoints,
              `代购订单超时自动取消退还积分：${order.productName || '特产'}（单号 ${order.orderNo || order._id}）`,
              order._id
            )
          }
        }

        result.cancelled++
        console.log(`[dailyTasks/autoCancelTimeout] cancelled order ${order._id}, refundedPoints=${refundPoints}`)
      } catch (e) {
        result.errors++
        console.error(`[dailyTasks/autoCancelTimeout] failed for order ${order._id}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[dailyTasks/autoCancelTimeout]', e)
    result.errors++
  }

  return result
}

// ═══════════════════════════════════════════════════
// 任务2：自动确认收货（shipped 超过 14天）
// ═══════════════════════════════════════════════════
async function autoConfirmReceivedOrders() {
  const result = { processed: 0, confirmed: 0, errors: 0 }
  const cutoffTime = new Date(Date.now() - AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000)

  try {
    const res = await db.collection('daigouOrders')
      .where({
        status: 'shipped',
        shipTime: _.lt(new Date(cutoffTime))
      })
      .limit(100)
      .get()

    const orders = res.data || []
    result.processed = orders.length
    console.log(`[dailyTasks/autoConfirmReceived] found ${orders.length} orders to confirm`)

    for (const order of orders) {
      try {
        await db.collection('daigouOrders').doc(order._id).update({
          data: {
            status: 'completed',
            receiveTime: db.serverDate(),
            autoConfirmed: true,
            updateTime: db.serverDate()
          }
        })

        // ── 奖励买家积分（消费金额5%，不低于5分）──
        const buyerRewardAmount = Math.max(
          BUYER_REWARD_MIN,
          Math.round((order.actualPrice || order.price || 0) * BUYER_REWARD_RATE)
        )
        const buyerDocId = await findUserDocId(order.buyerOpenid)
        if (buyerDocId) {
          await db.collection('users').doc(buyerDocId).update({
            data: { points: _.inc(buyerRewardAmount), updateTime: db.serverDate() }
          })
          await addPointsLog(
            order.buyerOpenid,
            'daigou_complete_reward',
            buyerRewardAmount,
            `代购订单完成奖励积分：${order.productName || '特产'}（单号 ${order.orderNo || order._id}）`,
            order._id
          )
        }

        // ── 奖励卖家积分（固定20分）──
        const sellerDocId = await findUserDocId(order.sellerOpenid)
        if (sellerDocId) {
          await db.collection('users').doc(sellerDocId).update({
            data: {
              points: _.inc(SELLER_REWARD_POINTS),
              'daigouStats.completedOrders': _.inc(1),
              updateTime: db.serverDate()
            }
          })
          await addPointsLog(
            order.sellerOpenid,
            'daigou_seller_reward',
            SELLER_REWARD_POINTS,
            `代购完成卖家奖励积分：${order.productName || '特产'}（单号 ${order.orderNo || order._id}）`,
            order._id
          )
        }

        result.confirmed++
        console.log(`[dailyTasks/autoConfirmReceived] confirmed order ${order._id}`)
      } catch (e) {
        result.errors++
        console.error(`[dailyTasks/autoConfirmReceived] failed for order ${order._id}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[dailyTasks/autoConfirmReceived]', e)
    result.errors++
  }

  return result
}

// ═══════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════
exports.main = async (event, context) => {
  const startTime = Date.now()
  console.log('[dailyTasks] start, event=', JSON.stringify(event))

  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    tasks: {}
  }

  // 任务1：自动取消 confirmed 超时订单
  try {
    results.tasks.autoCancelConfirmed = await autoCancelConfirmedOrders()
  } catch (e) {
    console.error('[dailyTasks] autoCancelConfirmed crashed:', e)
    results.tasks.autoCancelConfirmed = { error: e.message }
  }

  // 任务2：超时取消
  try {
    results.tasks.autoCancelTimeout = await autoCancelTimeoutOrders()
  } catch (e) {
    console.error('[dailyTasks] autoCancelTimeout crashed:', e)
    results.tasks.autoCancelTimeout = { error: e.message }
  }

  // 任务3：自动确认收货
  try {
    results.tasks.autoConfirmReceived = await autoConfirmReceivedOrders()
  } catch (e) {
    console.error('[dailyTasks] autoConfirmReceived crashed:', e)
    results.tasks.autoConfirmReceived = { error: e.message }
  }

  results.costMs = Date.now() - startTime
  console.log('[dailyTasks] done, results=', JSON.stringify(results))
  return results
}
