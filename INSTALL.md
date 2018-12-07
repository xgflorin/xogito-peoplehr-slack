## Disclaimer

This code is experimental and **NOT LICENSED** for any use.
Excuse the mess, the whole app had to be re-deisgned from scratch several times.
Who knew coding is hard, rite?
No standards were followed, but no Xogitians were harmed during development.

## Installation

@Georgi: Install this bot server on an instance which can accept incoming HTTP connections (from Slack and PeopleHR).
Make sure `node` 8+ and `tzdata` are installed. Then, create the `.env` file and `npm start`.
Test it by sending `/pplhr` anywhere in Slack.

### Configuring Slack

_Inspired from: https://github.com/slackapi/template-slash-command-and-dialogs_

1. Create an app at https://api.slack.com/apps (name it something like "PeopleHR bot")

2. Go to Basic Information -> Add features and functionality -> Slash Commands

3. Add the command `/pplhr` with request URL `http://68.183.79.249:3000/timesheet/query` and short description "Open today's timesheet"

4. Go to Basic Information -> Add features and functionality -> Interactive Components

5. Enable interactivity for request URL `http://68.183.79.249:3000/timesheet/update`

6. Go to Basic Information -> Add features and functionality -> Permissions

7. Generate the workspace tokens and put the OAuth Access Token in your `.env` file as `SLACK_ACCESS_TOKEN`

8. Scroll down to Scopes and add the following permissions: `chat:write:bot`, `groups:write`, `bot`, `commands`, `users:read`, `users:read.email`

9. Go to Basic Information -> Install your app to your workspace

10. Install app

11. Scroll down to App Credentials

12. Copy the signing secret to `.env` as `SLACK_SIGNING_SECRET`

### Configuring PeopleHR

1. Open PeopleHR at https://xogito.peoplehr.net/

2. On the left side, scroll down and open Settings

3. In the second menu select API

4. Generate a new API key with the name `Slack bot` and permissions:
    - `Employee`: `Get All Employee Detail`
    - `Timesheet`: Select all

5. Copy the key to `.env` as `PEOPLEHR_API_KEY`

### Example .env

```dotenv
PORT=3000
SLACK_ACCESS_TOKEN=xoxb-349193927412-136656642997-1uHGWJ1tGcCWePkw2h28Sifw
SLACK_SIGNING_SECRET=49880b52acecde4ea91a9d3c62af3662
SLACK_SECRET_CHANNEL=#xogito-peoplehr-bot
PEOPLEHR_API_KEY=c43627c9-42d2-8c1b-61e9-1d1a5f4d6bec
```

Make sure the port is open so that Slack and PeopleHR can reach the bot.

Invite the bot to the secret channel, where (in a future version) it will report logins/logouts live.

### Starting the app

Running `npm start` will install the npm dependencies and start `nodemon`.
