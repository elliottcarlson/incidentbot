# IncidentBot

A Slack bot that assists in managing incident response and post mortem logging.

### Setup

Clone this repo.

Go to your [Custom Integrations](https://www.slack.com/apps/manage/custom-integrations)
page for your Slack instance and set up a new Bot integration. Copy the API
token and save for later.

If running locally, copy `.env-sample` to `.env` and add your Slack API token
to the `.env` file.

You can also set the environment variables listed in the `.env` file on your
host directly.

If running on a hosted service such as Heroku, you can set the Config Variables
on your apps Settings page.

### Run

Run `npm install` if you have just cloned the repo for the first time, to
install the required dependencies.

Run `npm start` to start IncidentBot.

### Usage

The bot will now join your Slack instance if you specified the correct API
token. You can invite the bot to whatever channel you want it to be present in.

IncidentBot understands the following commands:

- `.help` - The below listed commands.
- `.start [TITLE]` - Start logging a new incident.
- `.resolve` - Resolve an ongoing incident and see the chat log since it started.
- `.history` - View a log in snippet format since the incident started.
- `.point` - Assign yourself as the point person of the ongoing incident.
- `.status` - View ongoing incidents.

### Quick Deploy

You can quickly run IncidentBot via Heroku. Clicking this button will take you to
Heroku, where you will be able to enter your Slack API token and launch the bot
on a single worker dyno.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

