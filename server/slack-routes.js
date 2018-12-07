const KoaRouter = require('koa-router')
const SlackClient = require('@slack/client')
const xMoment = require('../lib/x-moment')
const peopleHrApi = require('../lib/peoplehr-api')

const slack = new SlackClient.WebClient(process.env.SLACK_ACCESS_TOKEN)

const getLogMessage = async (user_id, user_email) => {
  const x = await peopleHrApi.getFields(user_email)

  return {
    channel: user_id,
    text: `*[ ${xMoment().format('ddd, MMM Do HH:mm:ss')} ]*`,
    attachments: [
      {
        fallback: 'https://xogito.peoplehr.com/',
        callback_id: 'timesheet-action',
        color: 'good',

        fields: x.fields,

        actions: [
          {
            type: 'button',
            name: 'refresh',
            value: 'refresh',
            text: ':arrows_counterclockwise: Refresh'
          },
          x.isClockedOut
            ? {
              type: 'button',
              name: 'open_dialog',
              value: 'clock_dialog',
              text: ':arrow_forward: Clock in...',
              style: 'primary'
            }
            : {
              type: 'button',
              name: 'open_dialog',
              value: 'clock_dialog',
              text: ':black_square_for_stop: Clock out...',
              style: 'danger'
            },
          {
            type: 'button',
            name: 'open_dialog',
            value: 'log_dialog',
            text: ':clock2: Add work log...'
          }
        ]
      },
      {
        fallback: 'https://xogito.atlassian.net/wiki/spaces/XOLH/overview',
        footer: 'More cool stuff: <https://bit.ly/2BYnuQo>',
      }
    ]
  }
}

const getClockDialog = () => {
  return {
    title: xMoment().format('ddd, MMM Do HH:mm'),
    callback_id: 'clock',
    elements: [
      {
        label: 'Select an action...',
        type: 'select',
        name: 'action',
        options: [
          { label: 'Clock in', value: 'clock_in' },
          { label: 'Clock out', value: 'clock_out' }
        ]
      }
    ],
    submit_label: 'Submit'
  }
}

const getLogDialog = async (user_email) => {
  const projs = await peopleHrApi.getAllProjects(user_email)

  return {
    title: xMoment().format('ddd, MMM Do HH:mm'),
    callback_id: 'log',
    elements: [
      {
        label: 'Select a project...',
        type: 'select',
        name: 'project',
        options: projs.map((p) => ({ label: p, value: p }))
      },
      {
        label: 'Duration',
        type: 'text',
        name: 'duration',
        hint: 'How long did you work today on this project? (format HH:MM or HH.MM)'
      }
    ],
    submit_label: 'Submit'
  }
}

module.exports = new KoaRouter()
  .post('/timesheet/query',
    async (ctx) => {
      const userId = ctx.request.body.user_id

      const userResponse = await slack.users.info({ user: userId })
      const email = process.env.PEOPLEHR_TEST_EMAIL || userResponse.user.profile.email

      console.log(`Query from user ${userId} ${email}}`)

      getLogMessage(userId, email)
        .then((logMessage) => slack.chat.postMessage(logMessage))
        .catch((e) => console.error(`${xMoment().format('YYYY-MM-DD HH:mm:ss')} ${userId} ${e.stack}`))

      ctx.body = ''
    })

  .post('/timesheet/update',
    async (ctx) => {
      const payload = JSON.parse((ctx.request.body || {}).payload)

      const userId = payload.user.id

      const userResponse = await slack.users.info({ user: userId })
      const email = process.env.PEOPLEHR_TEST_EMAIL || userResponse.user.profile.email

      console.log(`Update from ${email} => ${JSON.stringify(payload)}`)

      ctx.body = ''

      const actionName = payload ?
        (payload.actions && payload.actions.length && payload.actions[ 0 ].value)
        || (payload.submission && payload.submission.action)
        : ''
      switch (actionName) {
        case 'refresh':
          break

        case 'clock_dialog':
          slack.dialog.open({
            trigger_id: payload.trigger_id,
            dialog: JSON.stringify({ ...getClockDialog(), state: payload.message_ts })
          })
          break

        case 'log_dialog':
          slack.dialog.open({
            trigger_id: payload.trigger_id,
            dialog: JSON.stringify({ ...await getLogDialog(email), state: payload.message_ts })
          })
          break

        case 'clock_in':
          const clockInResponse = await peopleHrApi.clockInOut(email, 'TimeIn')
          if (clockInResponse.isError) {
            throw new Error(`PeopleHR API error: ${clockInResponse.Message}`)
          }
          break

        case 'clock_out':
          const clockOutResponse = await peopleHrApi.clockInOut(email, 'TimeOut')
          if (clockOutResponse.isError) {
            throw new Error(`PeopleHR API error: ${clockOutResponse.Message}`)
          }
          break
      }

      const projectName = payload ? payload.submission && payload.submission.project : ''
      if (projectName) {
        const peopleResponse = await peopleHrApi.logWork(email, projectName, payload.submission.duration)
        if (peopleResponse.errors) {
          ctx.body = peopleResponse
        }
      }

      if (payload.channel && payload.channel.id && (payload.message_ts || payload.state)) {
        slack.chat.update({
          ...await getLogMessage(payload.channel.id, email),
          ts: payload.message_ts || payload.state,
        })
      }

      // if (actionName !== 'refresh'&&process.env.SLACK_SECRET_CHANNEL) {
      //   let icon = ':interrobang:'
      //   if (actionName === 'sign_out') {
      //     icon = ':black_square_for_stop:'
      //   } else if (actionName.indexOf('sign_in_') === 0) {
      //     icon = ':arrows_counterclockwise:'
      //   }
      //
      //   const time = moment().tz('America/New_York').format('HH:mm')
      //
      //   const getText = () => {
      //     if (actionName === 'sign_out') {
      //       return `:black_square_for_stop: <@${payload.user.name}> sign out at ${time}`
      //     } else if (actionName.indexOf('sign_in_') === 0) {
      //       return `:arrows_counterclockwise: <@${payload.user.id}> sign in to ${actionName.substr(8)} at ${time}`
      //     }
      //   }
      //
      //   slack.chat.postMessage({
      //     channel: process.env.SLACK_SECRET_CHANNEL,
      //     text: getText()
      //   })
      // }
    })
