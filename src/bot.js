import dotenv from 'dotenv';
import moment from 'moment';
import 'moment-duration-format';
import { Ghee, ghee } from 'ghee';
import { Attachments } from 'ghee/lib/attachment';

dotenv.config({ silent: true });

const token = process.env.SLACK_API_TOKEN || '';

const date_format = 'dddd, MMMM Do YYYY, h:mm:ss a';

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
      point: null,
      title: title,
      history: [],
      last_updated: moment(),
      nag: setInterval(this.nag.bind(this, channel), 60000)
    }

    this.incidents[channel.id] = incident;
    const hangoutsTitle = title.replace(/\s/g, '-');
    return `Starting new incident "${title}" at ${startDt.format(date_format)} UTC \n Join this hangout to collaborate: g.co/hangout/slicelife.com/incident-${hangoutsTitle}`;
  }

  /**
   * Nag method to remind people to perform certain actions
   */
  nag(channel) {
    if (channel.id in this.incidents) {
      let incident = this.incidents[channel.id];

      if (!incident.point) {
        this.slack.sendMessage('No one has been set as point person. Use ' +
          '`.point` to assign someone.', incident.source_id);
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

      let point = attachment.add_field();
      point.title = `Point Person`;
      point.value = this.incidents[incident].point || '_Unassigned_';
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
        `[${moment().format(date_format)}] *${from.name}*: ${msg}`
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
        `> *Incident Start*: ${incident.start_dt.format(date_format)}\n` +
        `> *Incident Duration*: ${dateDiff(incident.start_dt, moment())}\n` +
        `> *Initiated By*: ${incident.reporter_real_name}\n` +
        `> *Point Person*: ${incident.point || '_Unassigned_'}\n\n`;

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
   * Assign someone as the point person of this incident.
   *
   * .point <optional:user>
   */
  point(params, from, channel) {
    if (channel.id in this.incidents) {
      this.incidents[channel.id].point = from.real_name;

      return `${from.real_name} is now the point person for this incident.`;
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
    '> `.point` - Assign yourself as the point person of the ongoing incident.\n' +
    '> `.status` - View ongoing incidents.';
  }
}

function dateDiff(start, end) {
  return moment.duration(start.diff(end)).format('w[w] d[d] h[h] m[m] s[s]');
}

var bot = new IncidentBot(token);
