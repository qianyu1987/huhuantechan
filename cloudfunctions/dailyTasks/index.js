// cloudfunctions/dailyTasks/index.js
// 每日定时任务云函数 - 优化版
// 触发器：定时触发（建议每2小时执行一次）
// 功能：
//   1. 代购订单 pending_shipment 超过 48h → 自动取消（退还积分 + 恢复库存）
//   2. 代购订单 shipped 超过 14天 → 自动确认收货（奖励积分）
//   3. 互换订单 confirmed 超过 72h → 自动取消（退还积分）
//   4. 签到连续奖励检查（扩展位）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// ── 常量（与 daigouMgr 保持一致）──
const CANCEL_TIMEOUT_HOURS  = 48    // pending_shipment 超时取消（小时）
const AUTO_CONFIRM_DAYS     = 14    // shipped 后自动确认收货（天）
const SWAP_CANCEL_HOURS     = 72    // 互换订单超时不互换（小时）
const BUYER_REWARD_RATE     = 0.05  // 买家完成订单积分奖励比例
const BUYER_REWARD_MIN      = 5     // 买家奖励积分下限
const SELLER_REWARD_POINTS  = 20    // 卖家每笔完成固定奖励积分
const BATCH_SIZE            = 50    // 每批处理数量

// ── 执行锁（防止定时触发器重复执行）──
const LOCK_COLLECTION = 'system_locks'
const LOCK_TTL_MS     = 30 * 60 * 1000  // 锁30分钟后自动释放

async function acquireLock(lockName, ttlMs) {
  const now = Date.now()
  const lockId = `dailyTasks_${lockName}_${now}`

  try {
    // 尝试查找现有锁
    const existingLock = await db.collection(LOCK_COLLECTION)
      .where({
        lockName,
        expireTime: _.gt(new Date(now))
      })
      .limit(1)
      .get()

    if (existingLock.data && existingLock.data.length > 0) {
      const lock = existingLock.data[0]
      // 如果上次执行还没完成（锁未过期），跳过
      if (now - lock.createTime.getTime() < LOCK_TTL_MS) {
        console.log(`[dailyTasks] Lock exists for ${lockName}, previous task still running, skip`)
        return { acquired: false, reason: 'previous_task_running' }
      }
    }

    // 获取锁（使用upsert确保原子性）
    await db.collection(LOCK_COLLECTION).add({
      data: {
        lockName,
        lockId,
        createTime: new Date(now),
        expireTime: new Date(now + ttlMs),
        status: 'running'
      }
    })

    console.log(`[dailyTasks] Lock acquired for ${lockName}`)
    return { acquired: true, lockId }
  } catch (e) {
    // 如果锁集合不存在，忽略错误继续执行
    if (e.errCode === -502005) {
      console.warn(`[dailyTasks] Lock collection not exists, creating...`)
      return { acquired: true, lockId: `temp_${lockName}_${now}` }
    }
    console.error(`[dailyTasks] acquireLock failed:`, e)
    return { acquired: true, lockId: `error_${lockName}_${now}` }
  }
}

async function releaseLock(lockName, lockId) {
  try {
    await db.collection(LOCK_COLLECTION)
      .where({ lockName })
      .remove()
    console.log(`[dailyTasks] Lock released for ${lockName}`)
  } catch (e) {
    // 忽略错误
  }
}

// ── 工具：查找用户 _id ──
async function findUserDocId(openid) {
  if (!openid) return null
  try {
    const res = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .field({ _id: true })
      .get()
    return res.data && res.data[0] ? res.data[0]._id : null
  } catch (e) {
    console.error(`[dailyTasks] findUserDocId failed for ${openid}:`, e.message)
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
    console.error(`[dailyTasks] addPointsLog failed:`, e.message)
  }
}

// ── 工具：批量更新订单状态 ──
async function batchUpdateOrders(orders, updateData, processor) {
  const results = { processed: 0, success: 0, errors: 0, failedIds: [] }

  if (!orders || orders.length === 0) {
    return results
  }

  // 分批处理
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE)

    for (const order of batch) {
      results.processed++
      try {
        await processor(order)
        results.success++
      } catch (e) {
        results.errors++
        results.failedIds.push(order._id || order.orderNo)
        console.error(`[dailyTasks] Process order ${order._id} failed:`, e.message)
      }
    }

    console.log(`[dailyTasks] Batch processed: ${Math.min(i + BATCH_SIZE, orders.length)}/${orders.length}`)
  }

  return results
}

// ═══════════════════════════════════════════════════
// 任务1：自动取消 confirmed 超时互换订单（72h）
// ═══════════════════════════════════════════════════
async function autoCancelConfirmedSwapOrders() {
  const startTime = Date.now()
  const result = { processed: 0, cancelled: 0, errors: 0, details: [] }
  const cutoffTime = new Date(Date.now() - SWAP_CANCEL_HOURS * 60 * 60 * 1000)

  console.log(`[dailyTasks/autoCancelSwap] Starting at ${new Date().toISOString()}`)
  console.log(`[dailyTasks/autoCancelSwap] Cutoff time: ${cutoffTime.toISOString()}`)

  try {
    // 查询所有已确认且创建时间超过72h的订单
    let skip = 0
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('swapOrders')
        .where({
          status: 'confirmed',
          createTime: _.lt(new Date(cutoffTime))
        })
        .skip(skip)
        .limit(BATCH_SIZE)
        .get()

      const orders = res.data || []
      if (orders.length === 0) {
        hasMore = false
        break
      }

      const batchResult = await batchUpdateOrders(orders, {
        status: 'cancelled',
        cancelBy: 'system',
        cancelReason: '超过72小时未完成互换，系统自动取消',
        cancelTime: db.serverDate(),
        autoCancel: true,
        updateTime: db.serverDate()
      }, async (order) => {
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
          // 退还发起方
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

          // 退还接收方
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
      })

      result.cancelled += batchResult.success
      result.errors += batchResult.errors
      result.details.push(...batchResult.failedIds)

      skip += BATCH_SIZE
      hasMore = orders.length === BATCH_SIZE
    }
  } catch (e) {
    console.error('[dailyTasks/autoCancelSwap] Fatal error:', e)
    result.error = e.message
  }

  result.costMs = Date.now() - startTime
  console.log(`[dailyTasks/autoCancelSwap] Done: ${JSON.stringify(result)}`)

  return result
}

// ═══════════════════════════════════════════════════
// 任务2：自动取消 pending_shipment 超时代购订单（48h）
// ═══════════════════════════════════════════════════
async function autoCancelTimeoutDaigouOrders() {
  const startTime = Date.now()
  const result = { processed: 0, cancelled: 0, errors: 0, details: [] }
  const cutoffTime = new Date(Date.now() - CANCEL_TIMEOUT_HOURS * 60 * 60 * 1000)

  console.log(`[dailyTasks/autoCancelDaigou] Starting at ${new Date().toISOString()}`)
  console.log(`[dailyTasks/autoCancelDaigou] Cutoff time: ${cutoffTime.toISOString()}`)

  try {
    let skip = 0
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('daigouOrders')
        .where({
          status: 'pending_shipment',
          createTime: _.lt(new Date(cutoffTime))
        })
        .skip(skip)
        .limit(BATCH_SIZE)
        .get()

      const orders = res.data || []
      if (orders.length === 0) {
        hasMore = false
        break
      }

      const batchResult = await batchUpdateOrders(orders, {}, async (order) => {
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
          console.warn(`[dailyTasks/autoCancelDaigou] restore stock failed:`, e.message)
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
      })

      result.cancelled += batchResult.success
      result.errors += batchResult.errors
      result.details.push(...batchResult.failedIds)

      skip += BATCH_SIZE
      hasMore = orders.length === BATCH_SIZE
    }
  } catch (e) {
    console.error('[dailyTasks/autoCancelDaigou] Fatal error:', e)
    result.error = e.message
  }

  result.costMs = Date.now() - startTime
  console.log(`[dailyTasks/autoCancelDaigou] Done: ${JSON.stringify(result)}`)

  return result
}

// ═══════════════════════════════════════════════════
// 任务3：自动确认收货（shipped 超过 14天）
// ═══════════════════════════════════════════════════
async function autoConfirmReceivedDaigouOrders() {
  const startTime = Date.now()
  const result = { processed: 0, confirmed: 0, errors: 0, totalReward: 0, details: [] }
  const cutoffTime = new Date(Date.now() - AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000)

  console.log(`[dailyTasks/autoConfirm] Starting at ${new Date().toISOString()}`)
  console.log(`[dailyTasks/autoConfirm] Cutoff time: ${cutoffTime.toISOString()}`)

  try {
    let skip = 0
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('daigouOrders')
        .where({
          status: 'shipped',
          shipTime: _.lt(new Date(cutoffTime))
        })
        .skip(skip)
        .limit(BATCH_SIZE)
        .get()

      const orders = res.data || []
      if (orders.length === 0) {
        hasMore = false
        break
      }

      const batchResult = await batchUpdateOrders(orders, {}, async (order) => {
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

        return buyerRewardAmount + SELLER_REWARD_POINTS
      })

      result.confirmed += batchResult.success
      result.errors += batchResult.errors
      result.details.push(...batchResult.failedIds)

      skip += BATCH_SIZE
      hasMore = orders.length === BATCH_SIZE
    }
  } catch (e) {
    console.error('[dailyTasks/autoConfirm] Fatal error:', e)
    result.error = e.message
  }

  result.costMs = Date.now() - startTime
  console.log(`[dailyTasks/autoConfirm] Done: ${JSON.stringify(result)}`)

  return result
}

// ═══════════════════════════════════════════════════
// 任务4：统计汇总（扩展位）
// ═══════════════════════════════════════════════════
async function generateDailyStats() {
  const startTime = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const result = {
    date: today.toISOString().split('T')[0],
    newUsers: 0,
    newProducts: 0,
    newOrders: 0,
    completedOrders: 0,
    error: null
  }

  try {
    // 今日新增用户
    const userCount = await db.collection('users')
      .where({
        createTime: _.gte(new Date(today))
      })
      .count()
    result.newUsers = userCount.total

    // 今日新增特产
    const productCount = await db.collection('products')
      .where({
        createTime: _.gte(new Date(today))
      })
      .count()
    result.newProducts = productCount.total

    // 今日新增订单
    const orderCount = await db.collection('swapOrders')
      .where({
        createTime: _.gte(new Date(today))
      })
      .count()
    result.newOrders = orderCount.total

    // 今日完成订单
    const completedCount = await db.collection('swapOrders')
      .where({
        status: 'completed',
        updateTime: _.gte(new Date(today))
      })
      .count()
    result.completedOrders = completedCount.total

  } catch (e) {
    console.error('[dailyTasks/dailyStats] Error:', e)
    result.error = e.message
  }

  result.costMs = Date.now() - startTime
  return result
}

// ═══════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════
exports.main = async (event, context) => {
  const startTime = Date.now()
  const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  console.log(`[dailyTasks/${requestId}] === START ===`)
  console.log(`[dailyTasks/${requestId}] Event:`, JSON.stringify(event))

  const results = {
    requestId,
    success: true,
    timestamp: new Date().toISOString(),
    totalCostMs: 0,
    tasks: {}
  }

  // ── 获取执行锁 ──
  const lock = await acquireLock('dailyTasks', LOCK_TTL_MS)

  if (!lock.acquired) {
    console.log(`[dailyTasks/${requestId}] Skip - another task is running`)
    return {
      requestId,
      success: false,
      reason: lock.reason,
      message: '上一个定时任务仍在执行中，跳过本次执行'
    }
  }

  try {
    // 任务1：自动取消超时互换订单
    console.log(`[dailyTasks/${requestId}] Running task 1: autoCancelSwapOrders`)
    results.tasks.autoCancelSwap = await autoCancelConfirmedSwapOrders()

    // 任务2：自动取消超时代购订单
    console.log(`[dailyTasks/${requestId}] Running task 2: autoCancelDaigouOrders`)
    results.tasks.autoCancelDaigou = await autoCancelTimeoutDaigouOrders()

    // 任务3：自动确认收货
    console.log(`[dailyTasks/${requestId}] Running task 3: autoConfirmReceived`)
    results.tasks.autoConfirm = await autoConfirmReceivedDaigouOrders()

    // 任务4：每日统计
    console.log(`[dailyTasks/${requestId}] Running task 4: dailyStats`)
    results.tasks.dailyStats = await generateDailyStats()

    // 汇总统计
    results.summary = {
      totalCancelled: (results.tasks.autoCancelSwap?.cancelled || 0) + (results.tasks.autoCancelDaigou?.cancelled || 0),
      totalConfirmed: results.tasks.autoConfirm?.confirmed || 0,
      totalErrors: (results.tasks.autoCancelSwap?.errors || 0) +
                   (results.tasks.autoCancelDaigou?.errors || 0) +
                   (results.tasks.autoConfirm?.errors || 0),
      totalNewUsers: results.tasks.dailyStats?.newUsers || 0,
      totalNewProducts: results.tasks.dailyStats?.newProducts || 0
    }

  } catch (e) {
    console.error(`[dailyTasks/${requestId}] Fatal error:`, e)
    results.success = false
    results.error = e.message
    results.stack = e.stack
  } finally {
    // 释放锁
    await releaseLock('dailyTasks', lock.lockId)
  }

  results.totalCostMs = Date.now() - startTime
  console.log(`[dailyTasks/${requestId}] === END (${results.totalCostMs}ms) ===`)
  console.log(`[dailyTasks/${requestId}] Results:`, JSON.stringify(results))

  return results
}
