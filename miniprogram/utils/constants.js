// utils/constants.js - 全局常量

// 省份列表（34个省级行政区）
const PROVINCES = [
  { code: 'BJ', name: '北京', emoji: '🏙', color: '#E63946' },
  { code: 'TJ', name: '天津', emoji: '🌊', color: '#457B9D' },
  { code: 'HE', name: '河北', emoji: '🌾', color: '#2D6A4F' },
  { code: 'SX', name: '山西', emoji: '⛰', color: '#6B4226' },
  { code: 'NM', name: '内蒙古', emoji: '🐴', color: '#6BAA75' },
  { code: 'LN', name: '辽宁', emoji: '🦀', color: '#1D3557' },
  { code: 'JL', name: '吉林', emoji: '🦌', color: '#2D6A4F' },
  { code: 'HL', name: '黑龙江', emoji: '🌲', color: '#1A936F' },
  { code: 'SH', name: '上海', emoji: '🌆', color: '#E63946' },
  { code: 'JS', name: '江苏', emoji: '🍜', color: '#F4A261' },
  { code: 'ZJ', name: '浙江', emoji: '🫖', color: '#2D6A4F' },
  { code: 'AH', name: '安徽', emoji: '🍵', color: '#6BAA75' },
  { code: 'FJ', name: '福建', emoji: '🍵', color: '#2D6A4F' },
  { code: 'JX', name: '江西', emoji: '🌶', color: '#E63946' },
  { code: 'SD', name: '山东', emoji: '🥜', color: '#F4A261' },
  { code: 'HA', name: '河南', emoji: '🌾', color: '#F4A261' },
  { code: 'HB', name: '湖北', emoji: '🦆', color: '#457B9D' },
  { code: 'HN', name: '湖南', emoji: '🌶', color: '#E63946' },
  { code: 'GD', name: '广东', emoji: '🥮', color: '#FF6B35' },
  { code: 'GX', name: '广西', emoji: '🥭', color: '#6BAA75' },
  { code: 'HI', name: '海南', emoji: '🥥', color: '#1A936F' },
  { code: 'CQ', name: '重庆', emoji: '🫕', color: '#E63946' },
  { code: 'SC', name: '四川', emoji: '🌶', color: '#E63946' },
  { code: 'GZ', name: '贵州', emoji: '🍶', color: '#6B4226' },
  { code: 'YN', name: '云南', emoji: '🌸', color: '#FF6B35' },
  { code: 'XZ', name: '西藏', emoji: '🏔', color: '#1D3557' },
  { code: 'SN', name: '陕西', emoji: '🥟', color: '#F4A261' },
  { code: 'GS', name: '甘肃', emoji: '🐑', color: '#6B4226' },
  { code: 'QH', name: '青海', emoji: '🏔', color: '#457B9D' },
  { code: 'NX', name: '宁夏', emoji: '🌱', color: '#6BAA75' },
  { code: 'XJ', name: '新疆', emoji: '🍇', color: '#A8DADC' },
  { code: 'TW', name: '台湾', emoji: '🧋', color: '#F4A261' },
  { code: 'HK', name: '香港', emoji: '🫖', color: '#1D3557' },
  { code: 'MO', name: '澳门', emoji: '🍮', color: '#6B4226' }
]

// 特产品类
const PRODUCT_CATEGORIES = [
  { id: 'food', name: '零食小吃', icon: 'food' },
  { id: 'dried', name: '干货腊味', icon: 'dried' },
  { id: 'tea', name: '茶叶酒水', icon: 'tea' },
  { id: 'sauce', name: '酱料调味', icon: 'sauce' },
  { id: 'fruit', name: '水果生鲜', icon: 'fruit' },
  { id: 'craft', name: '手工文创', icon: 'craft' },
  { id: 'other', name: '其他', icon: 'other' }
]

// 估值区间
const VALUE_RANGES = [
  { id: 'v1', label: '30~50元', min: 30, max: 50 },
  { id: 'v2', label: '50~100元', min: 50, max: 100 },
  { id: 'v3', label: '100~200元', min: 100, max: 200 },
  { id: 'v4', label: '200元以上', min: 200, max: 9999 }
]

// 订单状态
const ORDER_STATUS = {
  PENDING: 'pending',         // 等待对方确认
  CONFIRMED: 'confirmed',     // 双方确认，待发货
  SHIPPED_A: 'shipped_a',    // 发起方已发货
  SHIPPED_B: 'shipped_b',    // 接受方已发货
  SHIPPED_BOTH: 'shipped',   // 双方已发货
  RECEIVED_A: 'received_a',  // 发起方已收货
  RECEIVED_B: 'received_b',  // 接受方已收货
  COMPLETED: 'completed',     // 交换完成
  CANCELLED: 'cancelled',     // 已取消
  DISPUTED: 'disputed'        // 纠纷中
}

// 信用分变化事件
const CREDIT_EVENTS = {
  COMPLETE_SWAP: +5,      // 完成一次互换
  GOOD_REVIEW: +2,        // 获得好评
  BAD_REVIEW: -10,        // 获得差评
  CANCEL_CONFIRMED: -5,   // 确认后取消
  DISPUTE_LOSE: -15,      // 纠纷败诉
  FIRST_SWAP: +3          // 首次互换奖励
}

// 特产品类 V2（扩充版，带emoji）
const PRODUCT_CATEGORIES_V2 = [
  { id: 'food', name: '零食小吃', emoji: '🍿' },
  { id: 'dried', name: '干货腊味', emoji: '🥓' },
  { id: 'tea', name: '茶叶酒水', emoji: '🍵' },
  { id: 'sauce', name: '酱料调味', emoji: '🫙' },
  { id: 'fruit', name: '水果生鲜', emoji: '🍑' },
  { id: 'craft', name: '手工文创', emoji: '🎨' },
  { id: 'grain', name: '粮油米面', emoji: '🌾' },
  { id: 'candy', name: '糖果蜜饯', emoji: '🍬' },
  { id: 'nut', name: '坚果炒货', emoji: '🥜' },
  { id: 'herb', name: '滋补药材', emoji: '🌿' },
  { id: 'pastry', name: '地方糕点', emoji: '🍰' },
  { id: 'costume', name: '民族服饰', emoji: '👘' },
  { id: 'farm', name: '土特农产', emoji: '🌽' },
  { id: 'other', name: '其他', emoji: '📦' }
]

// 估值区间 V2（带emoji icon）
const VALUE_RANGES_V2 = [
  { id: 'v0', label: '30元以下', emoji: '🪙', min: 0, max: 30 },
  { id: 'v1', label: '30~50元', emoji: '💰', min: 30, max: 50 },
  { id: 'v2', label: '50~100元', emoji: '💵', min: 50, max: 100 },
  { id: 'v3', label: '100~200元', emoji: '💎', min: 100, max: 200 },
  { id: 'v4', label: '200~500元', emoji: '🏆', min: 200, max: 500 },
  { id: 'v5', label: '500~1000元', emoji: '👑', min: 500, max: 1000 },
  { id: 'v6', label: '1000元以上', emoji: '🔥', min: 1000, max: 99999 }
]

// 特产描述标签（混合类型，可多选）
const DESC_TAGS = [
  { id: 'spicy', label: '香辣爽口', emoji: '🌶️' },
  { id: 'sweet', label: '甜而不腻', emoji: '🍯' },
  { id: 'crispy', label: '酥脆可口', emoji: '🍪' },
  { id: 'savory', label: '鲜香浓郁', emoji: '🥘' },
  { id: 'healthy', label: '清淡养生', emoji: '🥗' },
  { id: 'handmade', label: '纯手工制作', emoji: '🤲' },
  { id: 'heritage', label: '百年老字号', emoji: '🏛️' },
  { id: 'fresh', label: '当季新鲜', emoji: '🌿' },
  { id: 'hometown', label: '家乡味道', emoji: '🏡' },
  { id: 'gift', label: '送礼佳品', emoji: '🎁' }
]

// 信用等级体系
const CREDIT_TIERS = [
  {
    id: 1,
    name: '新手',
    icon: '🌱',
    minScore: 0,
    maxScore: 59,
    color: '#8E8E93',
    bgColor: 'rgba(142, 142, 147, 0.15)',
    benefits: ['每月分享1次', '基础匹配'],
    locked: ['发布神秘特产', '优先匹配', '专属标识', '创建分享圈'],
    desc: '信用较低，完成分享和好评可提升等级'
  },
  {
    id: 2,
    name: '普通',
    icon: '👤',
    minScore: 60,
    maxScore: 79,
    color: '#0A84FF',
    bgColor: 'rgba(10, 132, 255, 0.15)',
    benefits: ['每月分享3次', '基础匹配', '查看信用报告'],
    locked: ['发布神秘特产', '优先匹配', '专属标识', '创建分享圈'],
    desc: '信用良好，继续保持可解锁更多权益'
  },
  {
    id: 3,
    name: '信赖',
    icon: '⭐',
    minScore: 80,
    maxScore: 89,
    color: '#FF9F0A',
    bgColor: 'rgba(255, 159, 10, 0.15)',
    benefits: ['不限分享次数', '发布神秘特产', '优先匹配', '查看信用报告'],
    locked: ['专属标识', '创建分享圈'],
    desc: '信用优秀，已解锁核心权益'
  },
  {
    id: 4,
    name: '达人',
    icon: '👑',
    minScore: 90,
    maxScore: 100,
    color: '#FFD60A',
    bgColor: 'rgba(255, 214, 10, 0.15)',
    benefits: ['不限分享次数', '发布神秘特产', '优先匹配', '专属标识', '创建分享圈', '查看信用报告'],
    locked: [],
    desc: '最高信用等级，享受全部权益'
  }
]

// 功能开关默认值（全部开启）
const DEFAULT_FEATURE_FLAGS = {
  tab_match: true,
  tab_order: true,
  tab_publish: true,
  feature_mystery: true,
  feature_value_display: true,
  feature_swap: true,
  review_mode: false
}

module.exports = {
  PROVINCES,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORIES_V2,
  VALUE_RANGES,
  VALUE_RANGES_V2,
  DESC_TAGS,
  ORDER_STATUS,
  CREDIT_EVENTS,
  CREDIT_TIERS,
  DEFAULT_FEATURE_FLAGS
}
