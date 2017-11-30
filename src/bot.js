import dotenv from 'dotenv';
import moment from 'moment';
import 'moment-duration-format';
import { Ghee, ghee } from 'ghee';
import { Attachments } from 'ghee/lib/attachment';

dotenv.config({ silent: true });

const token = process.env.SLACK_API_TOKEN || '';

const prettyDateFormat = 'dddd, MMMM Do YYYY, h:mm:ss a';
const timestampDateFormat = 'YYYY-MM-DDTHH:mm:ss';

class IncidentBot extends Ghee {
  constructor(token) {
    super(token);

    this.incidents = {};
  }

  @ghee
  /**
   * Start a new incident.
   *
   * .start <incident title>
   */
  start(params, from, channel) {
    let startDt = moment();
    let title = params.join(' ');

    if (channel.id in this.incidents) {
      return `There is already an ongoing incident in this channel. If you ` +
        `have two ongoing incidents, invite me in to a different room to ` +
        `start an additional incident.`;
    }

    let self = this;
    let incident = {
      reporter_name: from.name,
      reporter_real_name: from.real_name,
      reporter_email: from.profile.email,
      source_id: channel.id,
      source_name: channel.name || 'Private Message',
      start_dt: startDt,
      commander: null,
      comms: null,
      planning: null,
      operations: null,
      title: title,
      history: [],
      last_updated: moment(),
      nag: setInterval(this.nag.bind(this, channel), 60000)
    }

    this.incidents[channel.id] = incident;

    return `
Starting new incident "${title}" at ${startDt.format(prettyDateFormat)} UTC
Join this hangout to collaborate: ${this.generateHangoutsLink(title)}
`;
  }

  generateHangoutsLink(title) {
    const hangoutsTitle = title.replace(/\s/g, '-');
    return `g.co/hangout/slicelife.com/incident-${hangoutsTitle}`;
  }

  /**
   * Nag method to remind people to perform certain actions
   */
  nag(channel) {
    if (channel.id in this.incidents) {
      let incident = this.incidents[channel.id];

      const roles = ['commander', 'operations', 'comms', 'planning'];
      const missingRoles = roles.filter(key => !incident[key]);

      if (missingRoles.length > 0) {
        const message = `Missing incident roles:\n${missingRoles.map(role => {
          return `  - *${role}*: use \`.${role}\` to claim it\n`;
        }).join('')}`;
        this.slack.sendMessage(message, incident.source_id);
      }

      if (moment.duration(moment().diff(incident.last_updated)).minutes() >= 5) {
        this.incidents[channel.id].last_updated = moment();
        this.slack.sendMessage(`There hasn't been any activity in this channel ` +
          `for at least 5 minutes - is the incident still ongoing? If not ` +
          `please \`.resolve\` the incident.`, incident.source_id);
      }
    }
  }

  @ghee
  /**
   * Resolve an ongoing incident.
   *
   * .resolve
   */
  resolve(params, from, channel) {
    if (!(channel.id in this.incidents)) {
      return `There are no active incidents in this channel.`;
    }

    let incident = this.incidents[channel.id];
    let duration = dateDiff(incident.start_dt, moment());

    this.history(params, from, channel);

    delete this.incidents[channel.id];

    return `Resolving incident "${incident.title}". Incident lasted ${duration}.`;
  }

  @ghee
  /**
   * Display current incident(s) status.
   *
   * .status
   */
  status(params, from, channel, msg) {
    let incidents = Object.keys(this.incidents).length;
    let attachments = new Attachments();

    switch (incidents) {
      case 0:
        return `There are no active incidents!`;
        break;
      case 1:
        attachments.text = `There is 1 active incident:`;
        break;
      default:
        attachments.text = `There are ${incidents} active incidents:`;
    }

    if (incidents === 0) {
      return `There are no active incidents.`;
    }

    for (let incident in this.incidents) {
      let attachment = attachments.add();
      attachment.title = this.incidents[incident].title;
      attachment.color = `#C0C0C0`;

      let duration = attachment.add_field();
      duration.title = `Duration`;
      duration.value = dateDiff(this.incidents[incident].start_dt, moment());

      let channel = attachment.add_field();
      channel.title = `Channel`;
      channel.value = `#${this.incidents[incident].source_name}`;

      let commander = attachment.add_field();
      commander.title = `Commander`;
      commander.value = this.incidents[incident].commander || '_Unassigned_';
      
      let operations = attachment.add_field();
      operations.title = `Operations Lead`;
      operations.value = this.incidents[incident].operations || '_Unassigned_';

      let comms = attachment.add_field();
      comms.title = `Communications Lead`;
      comms.value = this.incidents[incident].comms || '_Unassigned_';

      let planning = attachment.add_field();
      planning.title = `Planning Lead`;
      planning.value = this.incidents[incident].planning || '_Unassigned_';

      let hangouts = attachment.add_field();
      hangouts.title = `Hangouts Link`;
      hangouts.value = this.generateHangoutsLink(this.incidents[incident].title);
    }

    return attachments;
  }

  @ghee('*')
  /**
   * Method to catch all chat activity during an incident
   */
  save_history(msg, from, channel) {
    if (channel.id in this.incidents) {
      this.incidents[channel.id].last_updated = moment();
      this.incidents[channel.id].history.push(
        `[${moment().format(timestampDateFormat)}] **${from.name}**: ${msg}`
      );
    }
  }

  @ghee
  /**
   * View the history of the chat since the incident started
   *
   * .history
   */
  history(params, from, channel) {
    if (channel.id in this.incidents) {
      let incident = this.incidents[channel.id];

      let history = `# ${incident.title}\n\n` +
        `> *Incident Start*: ${incident.start_dt.format(timestampDateFormat)}\n` +
        `> *Incident Duration*: ${dateDiff(incident.start_dt, moment())}\n` +
        `> *Initiated By*: ${incident.reporter_real_name}\n` +
        `> *Hangouts Link*: ${this.generateHangoutsLink(incident.title)}\n` +
        `> *Commander*: ${incident.commander || '_Unassigned_'}\n` +
        `> *Operations Lead*: ${incident.operations || '_Unassigned_'}\n` +
        `> *Communications Lead*: ${incident.comms || '_Unassigned_'}\n` +
        `> *Planning Lead*: ${incident.planning || '_Unassigned_'}\n\n`;

      let upload = {
        channels: channel.id,
        filetype: 'markdown',
        content: history + incident.history.join('\n')
      };
      this.web.files.upload(`${incident.title} Incident Log`, upload);
    }
  }

  @ghee
  /**
   * Assign someone as the commander person of this incident.
   *
   * .commander <optional:user>
   */
  commander(params, from, channel) {
    if (channel.id in this.incidents) {
      this.incidents[channel.id].commander = from.real_name;

      return `${from.real_name} is now the commander person for this incident.`;
    }
  }

  @ghee
  /**
   * Assign someone as the comms person of this incident.
   *
   * .comms <optional:user>
   */
  comms(params, from, channel) {
    if (channel.id in this.incidents) {
      this.incidents[channel.id].comms = from.real_name;

      return `${from.real_name} is now the comms person for this incident.`;
    }
  }

  @ghee
  /**
   * Assign someone as the planning person of this incident.
   *
   * .planning <optional:user>
   */
  planning(params, from, channel) {
    if (channel.id in this.incidents) {
      this.incidents[channel.id].planning = from.real_name;

      return `${from.real_name} is now the planning person for this incident.`;
    }
  }

  @ghee
  /**
   * Assign someone as the operations person of this incident.
   *
   * .operations <optional:user>
   */
  operations(params, from, channel) {
    if (channel.id in this.incidents) {
      this.incidents[channel.id].operations = from.real_name;

      return `${from.real_name} is now the operations person for this incident.`;
    }
  }

  @ghee
  /**
   * Display help on how to interact with incidentbot.
   *
   * .help
   */
  help() {
    return 'Use the following commands:\n' +
    '> `.start [TITLE]` - Start logging a new incident.\n' +
    '> `.resolve` - Resolve an ongoing incident and see the chat log since it started.\n' +
    '> `.history` - View a log in snippet format since the incident started.\n' +
    '> `.commander` - Assign yourself as the commander of the ongoing incident.\n' +
    '> `.status` - View ongoing incidents.';
  }
}

function dateDiff(start, end) {
  return moment.duration(start.diff(end)).format('w[w] d[d] h[h] m[m] s[s]');
}

var bot = new IncidentBot(token);
