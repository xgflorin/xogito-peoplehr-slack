const rp = require('request-promise')
const xMoment = require('./x-moment')

const EMPTY_INTERVAL = '...........'

const PplHR = (APIKey) => {
  return async (component, action, data = {}) => {
    return rp({
      method: 'POST',
      uri: `https://api.peoplehr.net/${component}`,
      json: true,
      body: {
        ...data,
        APIKey: APIKey,
        Action: action
      }
    })
  }
}

const pplhr = PplHR(process.env.PEOPLEHR_API_KEY)

const getAllEmployees = async () => pplhr('Employee', 'GetAllEmployeeDetail')
const getEmployeeByEmail = async (email) => {
  getEmployeeByEmail.cache = getEmployeeByEmail.cache || {}
  if (!getEmployeeByEmail.cache[ email ]) {
    const e = await getAllEmployees()
    getEmployeeByEmail.cache[ email ] = e.Result.find((e) => e.EmailId.DisplayValue.toLocaleLowerCase() === email.toLocaleLowerCase())
  }
  return getEmployeeByEmail.cache[ email ]
}
const getEmployeeIdByEmail = async (email) => {
  const e = await getEmployeeByEmail(email)
  return e.EmployeeId.DisplayValue
}
const mins2pretty = (mins) => `${Math.floor(mins / 60)}.${(mins % 60) < 10 ? '0' : ''}${mins % 60}'`

const getFields = async (email) => {
  const employeeId = await getEmployeeIdByEmail(email)

  const monday = xMoment().startOf('isoWeek').format('YYYY-MM-DD')
  const today = xMoment().format('YYYY-MM-DD')

  const [ timesheet, projectTimesheet ] = await Promise.all([
    pplhr('Timesheet', 'GetTimesheetDetail', {
      EmployeeId: employeeId,
      StartDate: monday,
      EndDate: today
    }),
    pplhr('ProjectTimesheet', 'GetProjectTimesheetDetail', {
      EmployeeId: employeeId,
      StartDate: monday,
      EndDate: today
    })
  ])

  console.debug(`pplhr:Timesheet:GetProjectTimesheetDetail ${email} => ${JSON.stringify(projectTimesheet)}`)
  console.debug(`pplhr:Timesheet:GetTimesheetDetail ${email} => ${JSON.stringify(timesheet)}`)

  const weeklyProjectNames = projectTimesheet.Result
    .map((pt) => pt.TimesheetProject)
    .filter((n, index, array) => array.indexOf(n) === index)
    .sort()

  const dailyProjectNames = weeklyProjectNames.filter((pn) => projectTimesheet.Result.some((pt) => pt.TimesheetProject === pn && pt.ProjectTimesheetDate === today))

  /* WEEKLY */

  const weeklyMinutesByProject = {}

  projectTimesheet.Result
    .forEach((pt) => {
      const time = pt.TotalHours.split(':').map(Number)
      weeklyMinutesByProject[ pt.TimesheetProject ] = ~~weeklyMinutesByProject[ pt.TimesheetProject ] + time[ 0 ] * 60 + time[ 1 ]
    })

  const minutesWorkedThisWeek = ~~(timesheet.Result[ 0 ] || {}).TotalTimeWorkedThisWeekInMins

  /* DAILY */

  const dailyMinutesByProject = {}

  projectTimesheet.Result
    .filter((pt) => pt.ProjectTimesheetDate === today)
    .forEach((pt) => {
      const time = pt.TotalHours.split(':').map(Number)
      dailyMinutesByProject[ pt.TimesheetProject ] = ~~dailyMinutesByProject[ pt.TimesheetProject ] + time[ 0 ] * 60 + time[ 1 ]
    })

  const minutesWorkedToday = ~~(timesheet.Result
      .find((t) => t.TimesheetDate === today)
    || {}).TotalTimeWorkedTodayInMins

  const dailyProjectMinutesStr = dailyProjectNames
    .map((pn) => `${mins2pretty(dailyMinutesByProject[ pn ])} ${pn}`)
    .join('\n')

  const tsToday = timesheet.Result.find((t) => t.TimesheetDate === today)

  if (!tsToday) {
    return {
      fields: [
        {
          title: `${mins2pretty(0)} Today (${EMPTY_INTERVAL} - ${EMPTY_INTERVAL})`,
          value: '',
          short: true
        },
        {
          title: `${mins2pretty(minutesWorkedThisWeek)} This Week`,
          value: weeklyProjectNames.map((pn) => `${mins2pretty(weeklyMinutesByProject[ pn ])} ${pn}`).join('\n'),
          short: true
        }
      ],
      isClockedOut: true
    }
  }

  let lastTimeOut = ''
  let i
  for (i = 1; tsToday[ `TimeOut${i}` ]; i++) {
    lastTimeOut = tsToday[ `TimeOut${i}` ]
  }
  let isClockedOut = !tsToday[ `TimeIn${i}` ]

  const dailyInterval = `(${tsToday.TimeIn1.replace(/:00$/, '')} - ${isClockedOut && lastTimeOut.replace(/:00$/, '') || EMPTY_INTERVAL})`

  return {
    fields: [
      {
        title: `${mins2pretty(minutesWorkedToday)} Today ${dailyInterval}`,
        value: dailyProjectMinutesStr,
        short: true
      },
      {
        title: `${mins2pretty(minutesWorkedThisWeek)} This Week`,
        value: weeklyProjectNames.map((pn) => `${mins2pretty(weeklyMinutesByProject[ pn ])} ${pn}`).join('\n'),
        short: true
      }
    ],
    isClockedOut
  }
}

const clockInOut = async (email, InOut) => {
  if (![ 'TimeIn', 'TimeOut' ].includes(InOut)) { throw new Error(`clockInOut needs InOut parameter to be TimeIn or TimeOut`) }
  const employeeId = await getEmployeeIdByEmail(email)

  const today = xMoment().format('YYYY-MM-DD')

  const timesheet = await pplhr('Timesheet', 'GetTimesheetDetail', {
    'EmployeeId': employeeId,
    'StartDate': today,
    'EndDate': today
    // }).then((ts) => ts.Result[ 0 ])
  }).then((ts) => ts.Result && ts.Result[ 0 ])

  if (timesheet) {
    const updateTS = {
      EmployeeId: employeeId,
      TimesheetDate: today
    }

    let nextT = 1
    Object.keys(timesheet)
      .filter((k) => k.startsWith(InOut))
      .map((k) => Number(k.replace(/[^0-9]/g, '')))
      .sort()
      .forEach((k) => {
        updateTS[ `TimeIn${k}` ] = timesheet[ `TimeIn${k}` ].replace(/:00$/, '')
        updateTS[ `TimeOut${k}` ] = timesheet[ `TimeOut${k}` ].replace(/:00$/, '')
        if (timesheet[ `${InOut}${k}` ]) {
          nextT = k + 1
        }
      })

    if (!(`${InOut}${nextT}` in timesheet)) {
      throw new Error(`No room for ${InOut}${nextT}`)
    }

    const tsToLog = xMoment().format('HH:mm')

    if (InOut === 'TimeOut' && tsToLog === updateTS[ `TimeIn${nextT}` ]) {
      updateTS[ `TimeIn${nextT}` ] = ''
      updateTS[ `TimeOut${nextT}` ] = ''
    } else {
      updateTS[ `${InOut}${nextT}` ] = tsToLog
    }

    console.debug(`pplhr:Timesheet:UpdateTimesheet ${email} ${InOut} => ${JSON.stringify(updateTS)}`)

    return pplhr('Timesheet', 'UpdateTimesheet', updateTS)
  } else {
    const newTS = {
      EmployeeId: employeeId,
      TimesheetDate: today
    }

    newTS[ `${InOut}1` ] = xMoment().format('HH:mm')

    return pplhr('Timesheet', 'CreateNewTimesheet', newTS)
  }
}

const logWork = async (email, project, durationStr) => {
  const employeeId = await getEmployeeIdByEmail(email)

  const today = xMoment().format('YYYY-MM-DD')

  const [ todayTimesheet, todayProjectTimesheet ] = await Promise.all([
    pplhr('Timesheet', 'GetTimesheetDetail',
      {
        EmployeeId: employeeId,
        StartDate: today,
        EndDate: today
      })
      .then((t) => t.Result [ 0 ] || {}),
    pplhr('ProjectTimesheet', 'GetProjectTimesheetDetail',
      {
        EmployeeId: employeeId,
        StartDate: today,
        EndDate: today
      })
      .then((pt) => pt.Result)
  ])

  const minutesWorkedToday = ~~todayTimesheet.TotalTimeWorkedTodayInMins

  let minutesLoggedToday = todayProjectTimesheet
    .reduce((acc, pt) => {
      const time = pt.TotalHours.split(':').map(Number)
      return acc + time[ 0 ] * 60 + time[ 1 ]
    }, 0)

  const durationSplit = durationStr.replace(/\./g, ':').split(':').map(Number)
  const totalMinutes = durationSplit[ 0 ] * 60 + ~~durationSplit[ 1 ]

  if (minutesLoggedToday + totalMinutes > minutesWorkedToday + 10) {
    return {
      errors: [
        {
          name: 'duration',
          error: 'This will exceed the total time worked today'
        }
      ]
    }
  }

  const totalHours = mins2pretty(totalMinutes).replace('.', ':').replace('\'', '')

  const projectTimesheetToCreate = {
    EmployeeId: employeeId,
    ProjectTimesheetDate: today,
    TimesheetProject: project,
    TimesheetTask: '',
    TimesheetDetail: '',
    StartTime: '',
    EndTime: '',
    Quantity: '',
    TotalHours: `${totalHours.length < 4 ? '0' : ''}${totalHours}`
  }

  console.debug(`pplhr:ProjectTimesheet:CreateProjectTimesheet ${email} ${durationStr} ${project} => ${JSON.stringify(projectTimesheetToCreate)}`)

  await pplhr('ProjectTimesheet', 'CreateProjectTimesheet', projectTimesheetToCreate)

  return {}
}

const getAllProjects = async (email) => {
  const employeeId = await getEmployeeIdByEmail(email)

  return pplhr('ProjectTimesheet', 'GetAllTimesheetProject', {})
    .catch((e) => logger.error('ERROR =>', e.stack))
    .then((response) => (response.Result || []).map((pt) => pt.ProjectName))
}

module.exports = {
  getFields,
  clockInOut,
  logWork,
  getAllProjects
}
