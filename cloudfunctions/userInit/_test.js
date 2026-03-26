/**
 * userInit 云函数核心逻辑本地测试
 * 不依赖云数据库，直接测 isDefaultNick / isDefaultAvatar 判断
 */

const DEFAULT_NICK_NAMES = ['微信用户', 'WeChat User', '用户']

function checkUserProfile(userData) {
  const avatarUrl = userData.avatarUrl || ''
  const isDefaultNick = !userData.nickName || DEFAULT_NICK_NAMES.includes(userData.nickName.trim())
  const isDefaultAvatar = !avatarUrl || avatarUrl.includes('default-avatar') || avatarUrl.includes('defaultAvatar')
  const returnNickName = isDefaultNick ? '' : userData.nickName
  const returnAvatarUrl = isDefaultAvatar ? '' : avatarUrl
  return { isDefaultNick, isDefaultAvatar, returnNickName, returnAvatarUrl }
}

const testCases = [
  {
    desc: '✅ 正常用户（有昵称+自定义头像）',
    input: { nickName: 'xiaoqiange', avatarUrl: 'cloud://env/avatars/abc123.jpg' },
    expect: { returnNickName: 'xiaoqiange', returnAvatarUrl: 'cloud://env/avatars/abc123.jpg' }
  },
  {
    desc: '⚠️ 默认昵称"微信用户"',
    input: { nickName: '微信用户', avatarUrl: 'cloud://env/avatars/abc123.jpg' },
    expect: { returnNickName: '', returnAvatarUrl: 'cloud://env/avatars/abc123.jpg' }
  },
  {
    desc: '⚠️ 默认头像路径含 default-avatar',
    input: { nickName: 'xiaoqiange', avatarUrl: 'https://cdn.xxx.com/default-avatar.png' },
    expect: { returnNickName: 'xiaoqiange', returnAvatarUrl: '' }
  },
  {
    desc: '⚠️ 昵称和头像都是默认值',
    input: { nickName: '微信用户', avatarUrl: 'https://cdn.xxx.com/default-avatar.png' },
    expect: { returnNickName: '', returnAvatarUrl: '' }
  },
  {
    desc: '⚠️ 昵称为空字符串',
    input: { nickName: '', avatarUrl: 'cloud://env/avatars/abc123.jpg' },
    expect: { returnNickName: '', returnAvatarUrl: 'cloud://env/avatars/abc123.jpg' }
  },
  {
    desc: '⚠️ 头像为空',
    input: { nickName: 'xiaoqiange', avatarUrl: '' },
    expect: { returnNickName: 'xiaoqiange', returnAvatarUrl: '' }
  },
  {
    desc: '⚠️ WeChat User（英文默认昵称）',
    input: { nickName: 'WeChat User', avatarUrl: 'cloud://env/avatars/abc123.jpg' },
    expect: { returnNickName: '', returnAvatarUrl: 'cloud://env/avatars/abc123.jpg' }
  },
  {
    desc: '⚠️ 头像含 defaultAvatar（另一种路径）',
    input: { nickName: 'xiaoqiange', avatarUrl: 'https://thirdwx.qlogo.cn/mmopen/vi_32/defaultAvatar/132' },
    expect: { returnNickName: 'xiaoqiange', returnAvatarUrl: '' }
  },
]

let passed = 0, failed = 0
for (const tc of testCases) {
  const result = checkUserProfile(tc.input)
  const nickOk = result.returnNickName === tc.expect.returnNickName
  const avatarOk = result.returnAvatarUrl === tc.expect.returnAvatarUrl
  const ok = nickOk && avatarOk
  if (ok) {
    console.log(`PASS  ${tc.desc}`)
    passed++
  } else {
    console.log(`FAIL  ${tc.desc}`)
    if (!nickOk) console.log(`      nickName: 期望="${tc.expect.returnNickName}" 实际="${result.returnNickName}"`)
    if (!avatarOk) console.log(`      avatarUrl: 期望="${tc.expect.returnAvatarUrl}" 实际="${result.returnAvatarUrl}"`)
    failed++
  }
}

console.log(`\n共 ${testCases.length} 个用例，通过 ${passed}，失败 ${failed}`)
if (failed === 0) console.log('✅ 全部通过！云函数核心逻辑正确。')
else console.log('❌ 有用例失败，请检查逻辑。')
