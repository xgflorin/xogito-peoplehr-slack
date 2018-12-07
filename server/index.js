require('dotenv').config()
const MANDATORY_ENV_VARS = ['PORT', 'SLACK_ACCESS_TOKEN', 'SLACK_SIGNING_SECRET', 'PEOPLEHR_API_KEY']
MANDATORY_ENV_VARS.forEach((envVar) => {
  if (!process.env[ envVar ]) throw new Error(`Missing ${envVar} environment variable`)
})

const Koa = require('koa')
const koaBodyparser = require('koa-bodyparser')
const koaLogger = require('koa-logger')
const verify = require('../lib/verify-signature-middleware')

const slackRoutes = require('./slack-routes')

const PORT = process.env.PORT

new Koa()
  .use(koaBodyparser())
  .use(koaLogger())
  .use(verify())

  .use(slackRoutes.routes())

  .listen(PORT, () => console.log(`Listening on :${PORT}`))
