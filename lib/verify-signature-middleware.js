const crypto = require('crypto')
const timingSafeCompare = require('tsscmp')

module.exports = () => async (ctx, next) => {
  const signature = ctx.request.headers[ 'x-slack-signature' ]
  const timestamp = ctx.request.headers[ 'x-slack-request-timestamp' ]
  const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
  const [version, hash] = (signature || '').split('=')

  // Check if the timestamp is too old

  const fiveMinutesAgo = ~~(Date.now() / 1000) - (60 * 5)

  if (timestamp < fiveMinutesAgo) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }

  hmac.update(`${version}:${timestamp}:${ctx.request.rawBody}`)

  // check that the request signature matches expected value
  if (!timingSafeCompare(hmac.digest('hex'), hash)) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }

  await next()
}
