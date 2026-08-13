import type { DemoMessage, DemoReport, DemoThanks } from './types'

/**
 * Reputation, so profiles and post footers are not all zeroes.
 *
 * Weighted the way a club board weights it: the person who wrote down where the
 * money went, the parent who found four seats, and the one who explained a rule
 * without making anybody feel stupid all outscore the man who ranked the
 * chippers. Only just, in the last case.
 */
export const DEMO_THANKS: readonly DemoThanks[] = [
  { threadTitle: 'Where the pitch fund money went, in numbers', postIndex: 0, from: ['frank', 'noelle', 'rosa', 'tomas', 'paudie', 'bernie', 'member', 'gerry'] },
  { threadTitle: 'How subs work, in plain English', postIndex: 0, from: ['bernie', 'luca', 'siobhan', 'ellie', 'member', 'nia'] },
  { threadTitle: 'Volunteers: two hours on a Saturday morning, and that is the whole ask', postIndex: 0, from: ['petra', 'sam', 'luca', 'aoife', 'rosa', 'mira'] },
  { threadTitle: 'What the staff will and will not do', postIndex: 0, from: ['frank', 'rosa', 'moderator', 'kev', 'vex', 'petra'] },
  { threadTitle: 'Photos of children: the rule, and why it is not up for discussion', postIndex: 0, from: ['bernie', 'ellie', 'zoe', 'donal', 'nia', 'jt', 'siobhan'] },
  { threadTitle: 'U14 blitz on the 8th: lifts rota', postIndex: 1, from: ['mairead', 'ellie', 'nia', 'donal'] },
  { threadTitle: 'Defibrillator and first aid training: two dates, everyone welcome', postIndex: 0, from: ['bernie', 'zoe', 'gerry', 'siobhan', 'aoife', 'mairead', 'donal'] },
  { threadTitle: 'The spam wave last month, and what actually stopped it', postIndex: 0, from: ['siobhan', 'rosa', 'vex', 'kev', 'moderator'] },
  { threadTitle: 'Search finds nothing for a thread I am looking straight at', postIndex: 1, from: ['rosa', 'mira', 'dev', 'member'] },
  { threadTitle: 'Photos upload fine and then are not on the post', postIndex: 1, from: ['dev', 'noelle', 'mairead'] },
  { threadTitle: 'People were getting logged out every couple of hours. Fixed.', postIndex: 0, from: ['paudie', 'rosa', 'vex', 'petra'] },
  { threadTitle: 'Result: Ballyquin 1-3, and the seconds drew', postIndex: 0, from: ['bernie', 'siobhan', 'cormac', 'luca', 'hana', 'frank', 'dev', 'member'] },
  { threadTitle: 'Result: Ballyquin 1-3, and the seconds drew', postIndex: 2, from: ['luca', 'marty', 'deco'] },
  { threadTitle: 'Six came up from the U18s this year. Say hello to them.', postIndex: 3, from: ['cormac', 'marty', 'hana', 'donal'] },
  { threadTitle: 'The club is fifty next year and we should do something about it', postIndex: 1, from: ['siobhan', 'dev', 'paudie', 'ken', 'mira'] },
  { threadTitle: 'The 1996 team photo, scanned, and we cannot name four of them', postIndex: 0, from: ['siobhan', 'frank', 'paudie', 'dev', 'ken'] },
  { threadTitle: 'Photos from Saturday, all four hundred of them', postIndex: 0, from: ['bernie', 'cormac', 'hana', 'luca', 'dara', 'marty', 'una'] },
  { threadTitle: 'Summer camp photos — parents, read the first post before you scroll', postIndex: 0, from: ['ellie', 'bernie', 'zoe', 'nia'] },
  { threadTitle: 'The club will pay for coaching badges and nobody seems to know', postIndex: 0, from: ['donal', 'luca', 'ellie', 'mairead', 'zoe'] },
  { threadTitle: 'Summer camp: dates, and we need six helpers', postIndex: 0, from: ['zoe', 'ellie', 'bernie', 'donal'] },
  { threadTitle: 'Tuesday raid night: roster and sign-ups', postIndex: 1, from: ['rook', 'bolt', 'tinker', 'sunny'] },
  { threadTitle: 'The Tuesday crew has outgrown Tuesday', postIndex: 0, from: ['nova', 'pixel', 'tinker', 'admin', 'otter', 'wraith'] },
  { threadTitle: 'Winter tournament: brackets, rules and what you win', postIndex: 3, from: ['rook', 'glitch', 'nova'] },
  { threadTitle: 'My twelve-year-old wants to join the gaming side and I do not know what I am agreeing to', postIndex: 1, from: ['bernie', 'mairead', 'zoe', 'ellie', 'siobhan', 'nia'] },
  { threadTitle: 'Wanted: a decent mic, under €60', postIndex: 1, from: ['sunny', 'wraith', 'nova', 'tinker'] },
  { threadTitle: 'Child\'s bike, 20 inch, grown out of', postIndex: 0, from: ['mira', 'nia', 'rosa', 'kev'] },
  { threadTitle: 'Table quiz for the pitch fund — teams of four, 14th', postIndex: 0, from: ['ken', 'frank', 'noelle', 'siobhan'] },
  { threadTitle: 'Wanted: five-a-side goals that are not falling apart', postIndex: 1, from: ['olu', 'frank', 'sam'] },
  { threadTitle: 'The bins after Saturday. Please.', postIndex: 0, from: ['siobhan', 'marty', 'hana', 'rosa', 'petra'] },
  { threadTitle: 'Lapsed members: we are not chasing you, but the door is open', postIndex: 0, from: ['frank', 'siobhan', 'petra', 'rosa'] },
  { threadTitle: 'The board on a phone at a pitch with one bar of signal', postIndex: 0, from: ['admin', 'mairead', 'zoe', 'donal'] },
  { threadTitle: 'How do you handle a member who is technically fine and exhausting?', postIndex: 1, from: ['moderator', 'vex', 'kev', 'dara'] },
  { threadTitle: 'Match threads get heated. Where is the line?', postIndex: 2, from: ['moderator', 'deco', 'dara', 'siobhan', 'paudie'] },
  { threadTitle: 'Hello — I brought ten years of notices with me', postIndex: 0, from: ['admin', 'mira', 'ken', 'siobhan'] },
  { threadTitle: 'Moved here for work, joined the seconds for something to do', postIndex: 0, from: ['marty', 'frank', 'hana', 'deco', 'shay'] },
  { threadTitle: 'Ranked block results, week 6', postIndex: 0, from: ['glitch', 'pixel', 'cormac', 'bram'] },
  { threadTitle: 'Can we do a family rate?', postIndex: 0, from: ['ellie', 'mairead', 'nia', 'zoe', 'noelle'] },
  { threadTitle: 'What was your community before it was this?', postIndex: 5, from: ['mira', 'rosa', 'vex', 'ken'] },
]

/**
 * Private messages, so an inbox is not empty on first login. Three land on
 * `admin` and two on `moderator`, because those are the two accounts a visitor
 * is most likely to read the messages screen as.
 */
export const DEMO_MESSAGES: readonly DemoMessage[] = [
  {
    from: 'moderator',
    to: ['admin'],
    subject: 'One in the reports queue before you go',
    daysAgo: 1,
    message:
      'There is an open report on a post in Buy, sell and swap — the ticket one. I have left it rather than acting on it, because you said you wanted to see how the queue reads before we change the wording on the report form.\n\nThere is also a held post from a new account sitting in approvals. Same thing, left for you.',
  },
  {
    from: 'noelle',
    to: ['admin', 'siobhan'],
    subject: 'Handover list for whoever takes the books',
    daysAgo: 2,
    message:
      'Wrote out everything the treasurer actually does, month by month, because "it is about two hours a week" is true and useless.\n\nThe honest total is about four hours in January and about twenty minutes in July. If we say that out loud we might get somebody.',
  },
  {
    from: 'mairead',
    to: ['admin'],
    subject: 'Photo takedown — done, no action needed',
    daysAgo: 3,
    message:
      'A parent asked for one of the camp photos to come down this morning. It was gone in about ten minutes and I did not ask why, per the policy.\n\nTelling you only so that you are not surprised if you notice the count changed. Nothing to do.',
  },
  {
    from: 'rosa',
    to: ['admin', 'siobhan'],
    subject: 'The photo box — worth a proper thread?',
    daysAgo: 5,
    message:
      'Happy to turn the scanning into something more organised for the fiftieth: a thread per decade, and let people name the faces in the replies. The 1996 one got three names in a day and a half.\n\nWould want somebody to check I am not putting up anything a family would rather stayed in a box.',
  },
  {
    from: 'bernie',
    to: ['moderator'],
    subject: 'Thanks for the notifications thing',
    daysAgo: 4,
    message:
      'You have no idea how long I have been quietly missing threads and assuming everyone else just knew things.\n\nAlso: two other parents have said the same to me since. If you want a fourth mod for the juvenile corner, I would do it.',
  },
  {
    from: 'vex',
    to: ['admin'],
    subject: 'Constitution wording for the AGM',
    daysAgo: 6,
    message:
      'Had a go at two paragraphs that put the gaming side in the constitution without making it a separate club. Short version: same membership, same subs, one officer on the committee, and the under-18 rules are the club\'s, not ours.\n\nSend it back with red pen on it. I would rather be corrected now than on the night.',
  },
  {
    from: 'newcomer',
    to: ['admin'],
    subject: 'The running club thing',
    daysAgo: 2,
    message:
      'Thanks for the straight answer in my introduction thread — "the first month is work" is exactly what I needed to hear rather than a sales pitch.\n\nTwo of us are coming to the quiz. Would you mind if I brought a list of questions?',
  },
  {
    from: 'jt',
    to: ['moderator', 'admin'],
    subject: 'Second defib session filled up',
    daysAgo: 8,
    message:
      'Both nights are full and there are eleven people on a waiting list, so I am doing a third.\n\nCould somebody stick it in Announcements? Everything I post ends up in the noticeboard and half the club never scrolls that far.',
  },
]

/**
 * Open reports, so the moderation queue has something in it. Two, deliberately
 * of different kinds: one is obvious spam, and one is a member using the report
 * button the way the staff post asks them to — "probably fine, but look".
 */
export const DEMO_REPORTS: readonly DemoReport[] = [
  {
    reporter: 'member',
    threadTitle: 'Two tickets for the final, face value only',
    postIndex: 4,
    reason: 'Spam — link to an off-site ticket shop, account registered today.',
    hoursAgo: 4,
  },
  {
    reporter: 'ellie',
    threadTitle: 'My twelve-year-old wants to join the gaming side and I do not know what I am agreeing to',
    postIndex: 0,
    reason:
      'Not a complaint — flagging it for the welfare officer since it describes a child by age. Probably completely fine, would rather somebody looked.',
    hoursAgo: 30,
  },
]
