import type { DemoThread } from './types'

/**
 * General discussion and Events: the two busiest forums, and the ones that show
 * a fixture, a raid night, a blitz and a table quiz sitting in the same list
 * without any of them looking out of place.
 */
export const COMMUNITY_THREADS: readonly DemoThread[] = [
  {
    forum: 'general',
    author: 'marty',
    title: 'Six came up from the U18s this year. Say hello to them.',
    daysAgo: 160,
    message: [
      'Six players moved up to adult football this season and it is the biggest group we have had in a decade.',
      '',
      'A thing worth saying out loud, because it is the age we lose people: the step up is a shock. Bigger, faster, and the first time you get done by a thirty-four-year-old who has never run in his life, it is humbling.',
      '',
      'Nobody is getting dropped for a bad first month. Turn up.',
    ].join('\n'),
    replies: [
      {
        author: 'paudie',
        hoursAfter: 2,
        message:
          'Can confirm the thirty-four-year-old thing. I am forty-one now and it still works.',
      },
      {
        author: 'cormac',
        hoursAfter: 5,
        message: 'I am one of the six. Am I allowed to say I am terrified.',
      },
      {
        author: 'shay',
        hoursAfter: 6,
        quotes: 2,
        message:
          'You are, and you should not be. I came up three years ago and spent a season convinced everyone was better than me. Half of them were also convinced everyone was better than them.',
      },
      {
        author: 'hana',
        hoursAfter: 20,
        message:
          'Same on the ladies side — four up this year. Worth the two clubs doing something together for them, they mostly went to school with each other.',
      },
      {
        author: 'deco',
        hoursAfter: 44,
        message:
          'Whoever the young lad is who put one in the top corner past me on Tuesday can go straight back down to the U18s.',
      },
      {
        author: 'marty',
        hoursAfter: 50,
        message: 'That is Cormac. Welcome to adult football, Cormac.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'zoe',
    title: 'The club will pay for coaching badges and nobody seems to know',
    daysAgo: 110,
    message: [
      'This came up at the last committee meeting and it turns out it has been true for three years: if you coach a team here, the club pays for your badges.',
      '',
      'Level 1 is two Saturdays. It is not hard and it is genuinely useful — I coached for a year on instinct and the first module made me realise I had been running a session for nineteen children that only suited about four of them.',
      '',
      'Three places going for the spring course. Reply here or grab me at training.',
    ].join('\n'),
    replies: [
      {
        author: 'donal',
        hoursAfter: 3,
        message:
          'I will take one. Been coaching the U16s for two years on the basis that I once watched a video.',
      },
      {
        author: 'luca',
        hoursAfter: 8,
        message:
          'Would I be allowed do it if I do not coach yet but might? I have played all my life and never coached.',
      },
      {
        author: 'zoe',
        hoursAfter: 9,
        quotes: 2,
        message:
          'That is exactly who should do it. Half our coaches started because they did the course first and could not think of an excuse afterwards.',
      },
      {
        author: 'ellie',
        hoursAfter: 30,
        message:
          'Third place if it is still going. My youngest is in the U8s and they are desperate for helpers.',
      },
      {
        author: 'mairead',
        hoursAfter: 34,
        message: 'All three gone within a day and a half. I will ask about a second course.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'vex',
    title: 'The Tuesday crew has outgrown Tuesday',
    daysAgo: 120,
    message: [
      'Started with five of us after training because we could not be bothered going home. It is fifty-one people now, four of whom I have never met and two of whom are in Australia.',
      '',
      'One night a week does not fit that any more. What I would like to do:',
      '',
      '- **Tuesday stays the main night.** That is the one with the roster and the sign-ups.',
      '- **Sunday becomes the ranked block**, which Nova has been running unofficially for months anyway.',
      '- **Everything else is just people posting in Events** and whoever is around turns up.',
      '',
      'The thing I do not want is it turning into a second club with its own committee and its own arguments. Same club, different pitch.',
    ].join('\n'),
    replies: [
      {
        author: 'nova',
        hoursAfter: 1,
        message:
          'Happy to make Sunday official. All I need is somewhere to put the sign-up that people actually read, and that is this.',
      },
      {
        author: 'admin',
        hoursAfter: 4,
        message: 'Same club, different pitch is exactly right and I am stealing it for the AGM.',
      },
      {
        author: 'pixel',
        hoursAfter: 7,
        message:
          'The two in Australia are the reason the roster matters. If it is not written down at a fixed time, they get nothing.',
      },
      {
        author: 'otter',
        hoursAfter: 9,
        message:
          'Can confirm. I have been awake for a Tuesday night exactly once and it was a Wednesday morning.',
      },
      {
        author: 'paudie',
        hoursAfter: 26,
        message:
          'I do not understand a word of this and I am delighted it exists. Half of them come to the quiz now.',
      },
      {
        author: 'wraith',
        hoursAfter: 33,
        message:
          'The quiz is the best thing this club does and I say that as someone who has never been to it.',
      },
      {
        author: 'vex',
        hoursAfter: 48,
        message:
          'Right — Tuesday and Sunday it is. Rosters go up in Events on the Monday, same as always.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'siobhan',
    title: 'The club is fifty next year and we should do something about it',
    daysAgo: 28,
    message: [
      'Founded in 1976 in a back room with fourteen members and one set of jerseys that had to be handed back after every game.',
      '',
      'Next year is the fiftieth. I would like it to be more than a dinner and a photograph. Ideas welcome and no idea is too daft at this stage — somebody has already suggested a match against the 1996 team, which is both daft and my favourite.',
      '',
      'What I would really like is the history written down while the people who remember it are still here to argue about it.',
    ].join('\n'),
    replies: [
      {
        author: 'rosa',
        hoursAfter: 3,
        message:
          'The community centre has boxes of photographs going back to the seventies. Nobody has ever gone through them properly. I will open the room any evening somebody wants to.',
      },
      {
        author: 'dev',
        hoursAfter: 5,
        message:
          'I will scan them. Give me the boxes and a few weekends and we will have them all up here.',
      },
      {
        author: 'paudie',
        hoursAfter: 8,
        message:
          'My father played in the first team in 1978 and has a scrapbook. He will talk for four hours if you let him, which I think is the point.',
      },
      {
        author: 'ken',
        hoursAfter: 12,
        message:
          'Record him. Genuinely — phone on the table, no fuss. We will regret not having it.',
      },
      {
        author: 'frank',
        hoursAfter: 20,
        message:
          'The 1996 team match is happening whether the committee approves it or not. Three of us have already agreed and one has bought boots.',
      },
      {
        author: 'siobhan',
        hoursAfter: 31,
        quotes: 5,
        message:
          'The committee approves it on the condition that Jt is at the side of the pitch for the whole thing.',
      },
      { author: 'jt', hoursAfter: 33, message: 'I will be there with ice and a phone in my hand.' },
    ],
  },
  {
    forum: 'general',
    author: 'marty',
    title: 'Who is actually available on a Sunday?',
    daysAgo: 74,
    poll: {
      question: 'Realistically, how many Sundays a month can you play?',
      options: [
        { label: 'Every one', voters: ['deco', 'shay', 'oisin', 'cormac'] },
        { label: 'Three out of four', voters: ['luca', 'paudie', 'frank', 'una', 'hana'] },
        { label: 'One or two', voters: ['fiadh', 'donal', 'member', 'aoife'] },
        {
          label: 'I am here for everything except the football',
          voters: ['ken', 'rosa', 'sam', 'petra', 'mira', 'nia'],
        },
      ],
      closesInDays: null,
    },
    message: [
      'Not a guilt trip. I am trying to work out whether we can field two adult teams next season or whether we are pretending.',
      '',
      'Answer honestly. "One or two" is a completely fine answer and it is more useful to me than a maybe.',
    ].join('\n'),
    replies: [
      {
        author: 'frank',
        hoursAfter: 4,
        message:
          'The honest answer for the over-35s is that we field eleven by ringing people on the Saturday night, and it works, and I would not change it.',
      },
      {
        author: 'una',
        hoursAfter: 9,
        message:
          'Ladies side has the opposite problem — nineteen available and one pitch slot. If the seconds ever need the earlier time we will take the later one.',
      },
      {
        author: 'marty',
        hoursAfter: 26,
        message:
          'That is the most useful thing anyone has said to me this season and I am taking it to the fixtures meeting.',
      },
      {
        author: 'sam',
        hoursAfter: 50,
        message:
          'Voted "everything except the football" and I want it known that I attend more club events than most players.',
      },
      {
        author: 'deco',
        hoursAfter: 71,
        message: 'He does. He is at everything. He brings the dog.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'paudie',
    title: 'Can we talk about the dressing rooms',
    daysAgo: 51,
    message: [
      'The far dressing room has had one working shower since the spring, the bench is held together with a bolt somebody brought from home, and the window does not close.',
      '',
      'I am not having a go at anybody — I know the money is going on the pitch. But we had a team from the city last month and they got changed in the car park.',
    ].join('\n'),
    replies: [
      {
        author: 'gerry',
        hoursAfter: 2,
        message:
          'The shower is a part that has been on order since March. I ring them every fortnight. I will ring them again tomorrow.',
      },
      {
        author: 'siobhan',
        hoursAfter: 6,
        message:
          'Fair, and it is on the AGM agenda. The honest position is that drainage and dressing rooms are both needed and we can fund one.',
      },
      {
        author: 'noelle',
        hoursAfter: 9,
        message:
          'Numbers, so people can argue with facts: drainage is €14k, dressing rooms about €9k, and the pitch fund is at €6,200 after the quiz.',
      },
      {
        author: 'tomas',
        hoursAfter: 14,
        message:
          "There is a grant for facilities that closes in April and we have never once applied for it. I will do the form if somebody helps me with the club's financial bits.",
      },
      {
        author: 'noelle',
        hoursAfter: 15,
        quotes: 4,
        message: 'I will do the financial bits. Ring me this week.',
      },
      {
        author: 'frank',
        hoursAfter: 30,
        message:
          'Two of us can do the bench on a Saturday morning for the price of the timber. Say the word.',
      },
      {
        author: 'paudie',
        hoursAfter: 55,
        message: 'This is the most productive complaining I have ever done. Thanks all.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'bernie',
    title:
      'My twelve-year-old wants to join the gaming side and I do not know what I am agreeing to',
    daysAgo: 35,
    message: [
      'She plays anyway, at home, most evenings. She has now discovered that the club has a whole thing and wants in.',
      '',
      'I am not against it. I would just like to know what it actually involves and who is in the room, in the way that I know exactly who is on the pitch on a Saturday.',
    ].join('\n'),
    replies: [
      {
        author: 'vex',
        hoursAfter: 2,
        message:
          'Fair question and the right one to ask. Straight answers: under-16s need a parent to sign the same form as for football, they are only in the Sunday block which finishes at eight, and there are two adults on the call at all times who are vetted the same way the coaches are. No private messages between adults and under-16s — that is a rule with a ban attached, not a guideline.',
      },
      {
        author: 'mairead',
        hoursAfter: 4,
        message:
          'And it goes through me, same as any juvenile activity. If she signs up I will have her on the same list as the U14 squad.',
      },
      {
        author: 'bernie',
        hoursAfter: 7,
        message: 'That is a better answer than I got from the school about the tablets. Thank you.',
      },
      {
        author: 'zoe',
        hoursAfter: 22,
        message:
          'Two of the U10 parents asked me the same thing last week. Might be worth a pinned post rather than answering it eleven times.',
      },
      {
        author: 'vex',
        hoursAfter: 27,
        quotes: 4,
        message:
          'Writing it up tonight. It should have been written down before anyone had to ask.',
      },
      {
        author: 'bernie',
        hoursAfter: 74,
        message:
          'She has been to two. She is much better than the adults and has been very gracious about it, apparently.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'deco',
    title: 'The table after twelve games, and the maths that keeps us up',
    daysAgo: 20,
    message: [
      'Fourth, six points off second, nine off top, and eleven above the drop with eight to play.',
      '',
      'Three of the last eight are against the teams directly above us, which is either the season or the end of it. Nobody has been relegated from this division on 30 points in ten years and we are on 21.',
    ].join('\n'),
    replies: [
      {
        author: 'shay',
        hoursAfter: 1,
        message: 'We have played the top two away already. That is the bit nobody counts.',
      },
      {
        author: 'oisin',
        hoursAfter: 3,
        message:
          'Four of those games are on that pitch if it ever drains. Home form is the whole argument.',
      },
      {
        author: 'marty',
        hoursAfter: 8,
        message:
          'It is a good position and I would rather everyone stopped doing the maths and turned up on Tuesdays, but I know that is not going to happen.',
      },
      {
        author: 'frank',
        hoursAfter: 25,
        message:
          'I have done this maths on the back of a beer mat every February for twenty years and it has never once been right.',
      },
      { author: 'deco', hoursAfter: 46, message: 'It was right in 2019.' },
      {
        author: 'frank',
        hoursAfter: 48,
        quotes: 5,
        message: 'We went up in 2019. That is the exception that proves I should stop.',
      },
    ],
  },
  {
    forum: 'general',
    author: 'dara',
    title: 'End of season awards: nominations open',
    daysAgo: 96,
    message: [
      "Six awards this year: player of the year, players' player, young player, clubperson, most improved, and the one for the person who does the thing nobody sees.",
      '',
      'Nominate in here or message me. The last one is the one I care about and it is always the hardest to get names for, which tells you something.',
    ].join('\n'),
    replies: [
      {
        author: 'oisin',
        hoursAfter: 2,
        message:
          'Gerry. For the last one. He is at that pitch six mornings a week and half the club has never spoken to him.',
      },
      {
        author: 'una',
        hoursAfter: 5,
        message:
          'Seconding Gerry, and Bernie for clubperson — she has driven more of this club to more places than the bus has.',
      },
      {
        author: 'hana',
        hoursAfter: 9,
        message:
          'Zoe for the unseen one too. Nineteen U10s every Saturday and she has never once asked for anything.',
      },
      {
        author: 'cormac',
        hoursAfter: 20,
        message:
          "Shay for players' player. He talks the whole game and it is the only reason I know where to stand.",
      },
      {
        author: 'dara',
        hoursAfter: 44,
        message: 'Twenty-nine nominations and eleven of them are for Gerry. I think we know.',
      },
      { author: 'gerry', hoursAfter: 70, message: 'Stop it now. The pitch does itself.' },
    ],
  },
  {
    forum: 'general',
    author: 'mira',
    title: 'What was your community before it was this?',
    daysAgo: 63,
    message: [
      'Ours was a noticeboard in the shop window, then a mailing list, then a Facebook page, then two years of nothing, then this.',
      '',
      'The two years of nothing lost more people than any of the moves did. Curious what everyone else came from.',
    ].join('\n'),
    replies: [
      {
        author: 'rosa',
        hoursAfter: 2,
        message:
          'A website only I could edit, and before that a photocopied newsletter my mother typed. Twenty-one years of it.',
      },
      {
        author: 'tomas',
        hoursAfter: 4,
        message:
          'A spreadsheet. Genuinely. Cycling club sign-ups in a shared spreadsheet with a comments column that turned into a discussion forum by accident.',
      },
      {
        author: 'ken',
        hoursAfter: 6,
        message: 'A spreadsheet is a beautiful answer and I want to see it.',
      },
      {
        author: 'vex',
        hoursAfter: 11,
        message:
          'A chat server with 190 people and no history older than a fortnight, because that was the plan we were on.',
      },
      {
        author: 'sam',
        hoursAfter: 13,
        message:
          'The Facebook page. Left after the third time a post about a match was shown to nine people.',
      },
      {
        author: 'siobhan',
        hoursAfter: 25,
        message:
          'The two-years-of-nothing detail is the one to underline. Communities rarely die of a bad platform. They die of a gap.',
      },
      {
        author: 'mira',
        hoursAfter: 49,
        message: 'That is going on the noticeboard in the shop window, where we started.',
      },
    ],
  },

  {
    forum: 'events',
    author: 'paudie',
    title: 'Pre-season friendly: firsts v the over-35s, and it got out of hand',
    daysAgo: 140,
    prefix: 'result',
    message: [
      'Final score 4-3 to the over-35s and I will be talking about it until I die.',
      '',
      'In fairness to the firsts they had six players who were on holidays and we had a goalkeeper who used to play semi-professionally and has been waiting eleven years for this.',
      '',
      'Sixty euro on the gate for the pitch fund and about a hundred and fifty people there on a Wednesday evening in July.',
    ].join('\n'),
    replies: [
      {
        author: 'deco',
        hoursAfter: 1,
        message: 'I was not playing. I want that in the record. I was in Portugal.',
      },
      { author: 'oisin', hoursAfter: 2, message: 'We were not trying.' },
      {
        author: 'frank',
        hoursAfter: 3,
        quotes: 2,
        message: 'You were trying by the second half. I could hear you trying.',
      },
      {
        author: 'jt',
        hoursAfter: 14,
        message: 'Four separate men over forty asked me for ice afterwards. Worth every minute.',
      },
      {
        author: 'dara',
        hoursAfter: 20,
        message:
          'Best attended thing we did all summer and it cost us nothing. Doing it again in July.',
      },
      {
        author: 'siobhan',
        hoursAfter: 40,
        message: 'The gate was €160, not €60. Paudie was counting after the third pint.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'mairead',
    title: 'Summer camp: dates, and we need six helpers',
    daysAgo: 88,
    prefix: 'signup',
    message: [
      'Camp is the first week of August, 10 to 2, ages 6 to 12. Eighty places, and it filled in four days last year.',
      '',
      'What we actually need is six adults for the week. Vetted, and if you are not, we will sort it — it takes about three weeks so say now rather than in July.',
      '',
      'Transition-year students are very welcome as helpers and it counts for their work experience.',
    ].join('\n'),
    replies: [
      { author: 'zoe', hoursAfter: 2, message: 'In for the full week. I have the vetting.' },
      {
        author: 'ellie',
        hoursAfter: 6,
        message: 'Tuesday to Thursday for me. Not vetted, please start me on the form.',
      },
      {
        author: 'cormac',
        hoursAfter: 9,
        message:
          'I can do it as my work experience if that counts. I did the two-day thing last year.',
      },
      {
        author: 'mairead',
        hoursAfter: 11,
        quotes: 3,
        message: 'It counts and you were great with the small ones. In.',
      },
      {
        author: 'luca',
        hoursAfter: 30,
        message: 'Two full days from me, whichever two are hardest to fill.',
      },
      {
        author: 'mairead',
        hoursAfter: 72,
        message:
          'Six and a half helpers and all eighty places gone. The half is Cormac, who is doing four days and negotiating.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'nova',
    title: 'Winter tournament: brackets, rules and what you win',
    daysAgo: 40,
    prefix: 'signup',
    message: [
      'Sixteen teams of three, double elimination, seeded by nothing at all because none of us know what we are doing.',
      '',
      'Rules, such as they are:',
      '',
      '- Teams of three. One sub allowed, named before your first match.',
      '- Best of three until the semis, best of five after.',
      '- **Two under-18 places per team maximum**, and they play the early slots only.',
      '- The prize is a trophy that Tomás is making out of an old cup we found in the clubhouse. It is genuinely hideous.',
      '',
      'Sign up by replying with your three names. Fourteen teams so far.',
    ].join('\n'),
    replies: [
      {
        author: 'pixel',
        hoursAfter: 1,
        message:
          'Pixel, Sunny, Bram. Team name is "Healer Aggro" and we will not be taking questions.',
      },
      {
        author: 'wraith',
        hoursAfter: 3,
        message:
          'Wraith, Mango, Otter. We are in three different timezones and this is going to be a nightmare to schedule, which is our whole strategy.',
      },
      {
        author: 'rook',
        hoursAfter: 8,
        message: 'I have no team and I am new. Is there a pile of spare people?',
      },
      {
        author: 'nova',
        hoursAfter: 9,
        quotes: 3,
        message:
          'There is now. Post here if you are one and I will pair you up — three others have said the same.',
      },
      {
        author: 'glitch',
        hoursAfter: 14,
        message: 'Take me, I will play with anybody, I am mediocre in a very supportive way.',
      },
      {
        author: 'tinker',
        hoursAfter: 26,
        message: 'Sixteen teams. Bracket goes up Friday and the first round is the weekend after.',
      },
      {
        author: 'cormac',
        hoursAfter: 30,
        message: 'Under-18 here, dad has signed the thing, I am in with two lads from school.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'nova',
    title: 'Winter tournament final: result, and the bracket that broke',
    daysAgo: 33,
    prefix: 'result',
    message: [
      '**Winners: Healer Aggro** (Pixel, Sunny, Bram), 3-1 in the final over the three-timezone menace.',
      '',
      'The bracket broke in the quarters when two teams both had a player unavailable and we ended up playing a match at 6am for one of them. Worked. Would not do it again.',
      '',
      "Forty-one people watched the final on Bram's stream, which is about forty more than any of us expected.",
    ].join('\n'),
    replies: [
      {
        author: 'pixel',
        hoursAfter: 1,
        message:
          'The trophy is the worst object I have ever been given and it is on my desk forever.',
      },
      {
        author: 'wraith',
        hoursAfter: 2,
        message: 'We lost to a team who were awake. Next year we insist on 4am for everything.',
      },
      {
        author: 'rook',
        hoursAfter: 5,
        message:
          'My scratch team went out in round two and I have made three friends. Best €0 I ever spent.',
      },
      {
        author: 'tomas',
        hoursAfter: 9,
        message:
          'The trophy is made from a 1983 five-a-side cup nobody could identify. I am calling that heritage, not vandalism.',
      },
      {
        author: 'siobhan',
        hoursAfter: 22,
        message: 'It was a 1983 five-a-side cup and we won it. Tomás, we will be talking.',
      },
      {
        author: 'nova',
        hoursAfter: 44,
        message:
          'Doing it again in the spring, thirty-two teams, and I will seed it properly. Ish.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'rosa',
    title: 'Table quiz for the pitch fund — teams of four, 14th',
    daysAgo: 31,
    message: [
      'Quiz is on the 14th at half eight, teams of four, €5 a head. Raffle at the interval and Frank is doing the music round, which is a warning rather than an attraction.',
      '',
      "Prizes are donated by the shop, the garage and Tomás's cycling crowd. If you can get a prize out of anyone, tell me by Friday.",
      '',
      'We raised €1,180 last year and the drainage is not going to pay for itself.',
    ].join('\n'),
    replies: [
      {
        author: 'frank',
        hoursAfter: 2,
        message: 'The music round is fair and everybody says that until it starts.',
      },
      {
        author: 'ken',
        hoursAfter: 4,
        message:
          'Team of four from the board games night. We will lose the sport round by a historic margin.',
      },
      {
        author: 'pixel',
        hoursAfter: 8,
        message:
          'Two of us are travelling for it. Genuinely. We have never met any of you in person.',
      },
      {
        author: 'rosa',
        hoursAfter: 9,
        quotes: 3,
        message: 'Then you are on my team and I will hear no argument.',
      },
      {
        author: 'nia',
        hoursAfter: 20,
        message:
          'Got a voucher out of the hairdresser and a hamper from the shop. Both dropped to the clubhouse.',
      },
      {
        author: 'rosa',
        hoursAfter: 48,
        message:
          'Nineteen teams, €1,340, and the music round caused an actual argument. Same again in the autumn.',
      },
      {
        author: 'sam',
        hoursAfter: 55,
        message: 'The argument was because "Come On Eileen" is not a nineties song, Frank.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'dara',
    title: 'Cup draw is out: away in round two',
    daysAgo: 26,
    prefix: 'fixture',
    message: [
      'Away to Ballyquin Celtic, Sunday the 12th, 2pm. Bus from the clubhouse at 12:15 and it will leave at 12:15.',
      '',
      'They are a division above us and they beat us 5-0 in a friendly in 2023. Nobody in the current squad was playing that day except Paudie, who has asked me not to mention it.',
    ].join('\n'),
    replies: [
      { author: 'paudie', hoursAfter: 1, message: 'I asked you specifically not to mention it.' },
      {
        author: 'marty',
        hoursAfter: 3,
        message: 'Squad goes up Thursday. Tick available in the thread, not in my ear at training.',
      },
      {
        author: 'oisin',
        hoursAfter: 6,
        message: 'Bus. Both ways. No exceptions, I am not doing four cars again.',
      },
      {
        author: 'bernie',
        hoursAfter: 20,
        message: 'Room for three supporters in mine if the bus is full with the squad.',
      },
      {
        author: 'dev',
        hoursAfter: 26,
        message:
          'I will be there with the camera. Cup games are the only ones anyone ever wants a photo of.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'dara',
    title: 'Saturday: away to Ballyquin, bus at 12:15',
    daysAgo: 16,
    prefix: 'fixture',
    message: [
      'League game, away to Ballyquin, 2pm kick-off. Bus at 12:15 from the clubhouse.',
      '',
      'Seconds are at home at the same time, so the clubhouse will be open and there will be soup, which is the actual reason most people come.',
    ].join('\n'),
    replies: [
      {
        author: 'marty',
        hoursAfter: 4,
        message:
          'Seconds squad is up. Fourteen available, which after the season we have had is a small miracle.',
      },
      {
        author: 'shay',
        hoursAfter: 9,
        message:
          'Working till one. Can somebody bring my boots on the bus, they are in the far dressing room.',
      },
      { author: 'oisin', hoursAfter: 10, quotes: 2, message: 'Got them. They are disgusting.' },
      {
        author: 'jt',
        hoursAfter: 20,
        message:
          'I am at the seconds game, not the away one. Anyone travelling who needs strapping, catch me at the clubhouse before twelve.',
      },
      {
        author: 'gerry',
        hoursAfter: 30,
        message: 'Pitch passed the inspection at nine this morning. It was close.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'dara',
    title: 'Result: Ballyquin 1-3, and the seconds drew',
    daysAgo: 14,
    prefix: 'result',
    message: [
      '**Ballyquin 1 Rovers 3.** Oisín two, Luca one, and Deco with a save at 1-1 that changed the game.',
      '',
      '**Seconds 2-2** at home, having been two down at half time. Cormac scored his first for the adult side and did not stop grinning for an hour.',
      '',
      'Best day we have had all season. Photos in the other forum once Devinder has been through four hundred of them.',
    ].join('\n'),
    replies: [
      {
        author: 'deco',
        hoursAfter: 1,
        message: 'It was a good save. I would like the record to show it was a very good save.',
      },
      {
        author: 'oisin',
        hoursAfter: 2,
        message: 'Both of mine were tap-ins off Luca. Give him the write-up.',
      },
      {
        author: 'luca',
        hoursAfter: 4,
        message:
          'I have played eleven games here and that was the first time the away crowd was louder than the home one. Thank you to everyone who travelled.',
      },
      {
        author: 'bernie',
        hoursAfter: 6,
        message:
          'Three cars and the bus. The bus sang the whole way home, which the driver has asked me to describe as "singing".',
      },
      {
        author: 'cormac',
        hoursAfter: 9,
        message: 'First goal. It went in off my shin. Do not care.',
      },
      {
        author: 'marty',
        hoursAfter: 20,
        message:
          'Two down at half time and I said one thing at the break and it was not repeatable here. Delighted with them.',
      },
      {
        author: 'siobhan',
        hoursAfter: 30,
        message:
          'A hundred and ten people at a seconds game in February. That is the club working.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'mairead',
    title: 'U14 blitz on the 8th: lifts rota',
    daysAgo: 19,
    prefix: 'signup',
    message: [
      'Blitz is in Ennis on the 8th, three games, 10am to about 2pm. Fifteen children and, at the last count, four cars.',
      '',
      'Reply with how many seats you have and whether you can do there, back, or both. **Please do not offer a lift for a child who is not yours without checking with their parent here first** — it is the one rule I will be tediously strict about.',
    ].join('\n'),
    replies: [
      {
        author: 'bernie',
        hoursAfter: 1,
        message: 'Four seats, both ways. Happy to take anyone whose parent says so here.',
      },
      {
        author: 'ellie',
        hoursAfter: 3,
        message:
          'Three seats there only, I have to be back by half twelve. Mine can come home with Bernie if that suits her.',
      },
      { author: 'bernie', hoursAfter: 4, quotes: 2, message: 'That suits me. Consider it done.' },
      {
        author: 'donal',
        hoursAfter: 8,
        message: 'Four seats both ways and I will bring the first aid bag and the spare kit.',
      },
      {
        author: 'zoe',
        hoursAfter: 14,
        message: 'Two seats. I will be there anyway for the U10 lads playing up.',
      },
      {
        author: 'mairead',
        hoursAfter: 26,
        message:
          'Thirteen seats for fifteen children plus four adults. Sorted, and this took eleven minutes instead of forty messages.',
      },
      {
        author: 'mairead',
        hoursAfter: 250,
        message:
          'Blitz done: won one, drew one, lost one, and every single child got at least half a game. That is the whole point of a blitz.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'olu',
    title: 'Sports hall Thursday instead of the pitch — nine needed',
    daysAgo: 11,
    prefix: 'signup',
    message: [
      'Pitch is shut, so I have the sports hall for Thursday at seven. €4 a head to cover it, need at least nine to make it worth taking.',
      '',
      'Indoor, so trainers not boots, and the hall people will genuinely throw us out at eight sharp.',
    ].join('\n'),
    replies: [
      { author: 'frank', hoursAfter: 1, message: 'In.' },
      {
        author: 'aoife',
        hoursAfter: 2,
        message: 'In, and I will bring the two from work who keep saying they will come.',
      },
      { author: 'luca', hoursAfter: 4, message: 'In.' },
      {
        author: 'sam',
        hoursAfter: 5,
        message: 'In. Dog stays home for the indoor one, I have learned.',
      },
      { author: 'petra', hoursAfter: 9, message: 'In, first time, be gentle.' },
      { author: 'olu', hoursAfter: 26, message: 'Thirteen. Booked. See you at seven.' },
      {
        author: 'olu',
        hoursAfter: 51,
        message:
          'Thirteen played, nobody died, and the hall is ours every Thursday the pitch is off. Best €4 in the county.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'frank',
    title: 'Awards night and social: the 22nd, and there is a menu this year',
    daysAgo: 58,
    message: [
      'Awards night is the 22nd at the clubhouse, half seven for eight. €25 a head which covers the food.',
      '',
      "There is an actual menu this year instead of a tray of sandwiches at eleven o'clock. Three options, and I need numbers and choices by the 15th because the caterer is doing us a favour.",
      '',
      'Partners, parents and the people who do not play are all very welcome. Half this club has never seen the inside of the clubhouse on a Saturday night and that is a shame.',
    ].join('\n'),
    replies: [
      { author: 'noelle', hoursAfter: 3, message: 'Two, both the chicken. Paid.' },
      {
        author: 'hana',
        hoursAfter: 6,
        message:
          'Nine from the ladies squad. Six chicken, two vegetarian, one who says she will decide on the night — she will not, put her down for chicken.',
      },
      {
        author: 'vex',
        hoursAfter: 11,
        message:
          'Four of the gaming crowd travelling for it, including one who is flying. That is a longer trip than the away bus has ever done.',
      },
      {
        author: 'frank',
        hoursAfter: 12,
        quotes: 3,
        message:
          'If somebody is getting on a plane for the awards night then somebody is getting a lift from the airport. I will do it.',
      },
      {
        author: 'wraith',
        hoursAfter: 30,
        message:
          'It is me. I am the one flying. I have been in this club for two years and met four of you.',
      },
      {
        author: 'frank',
        hoursAfter: 74,
        message:
          'Ninety-one for the meal, which is thirty more than last year and the caterer has stopped answering me warmly.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'nova',
    title: 'Sunday ranked block, week 6 — sign up by Saturday',
    daysAgo: 8,
    prefix: 'signup',
    message: [
      'Same as always: 6pm to 8, teams drawn from whoever signs up, under-18s in the first hour only.',
      '',
      'Sign up by Saturday night so I can make the teams even rather than making them at 5:58 in a panic.',
    ].join('\n'),
    replies: [
      { author: 'sunny', hoursAfter: 2, message: 'In.' },
      {
        author: 'glitch',
        hoursAfter: 3,
        message: 'In, and I would like to be on a different team to Wraith for once in my life.',
      },
      {
        author: 'bolt',
        hoursAfter: 5,
        message: 'In for the first hour, it is half eleven here for the second.',
      },
      { author: 'cormac', hoursAfter: 9, message: 'In for the first hour.' },
      {
        author: 'otter',
        hoursAfter: 14,
        message: 'In. It is 5am for me and I have made my peace with that.',
      },
      { author: 'rook', hoursAfter: 20, message: 'In.' },
      {
        author: 'nova',
        hoursAfter: 30,
        message:
          'Fourteen signed up, teams are drawn, and Glitch is on a different team to Wraith. Enjoy that.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'nova',
    title: 'Ranked block results, week 6',
    daysAgo: 6,
    prefix: 'result',
    message: [
      'Week 6 done. Standings after six weeks:',
      '',
      '1. Wraith — 41',
      '2. Pixel — 38',
      '3. Nova — 34',
      '4. Mango — 33',
      '5. Glitch — 29',
      '',
      'Full table in the pinned post. Cormac is top of the under-18 side of it by eleven points and has been unbearable about it, correctly.',
    ].join('\n'),
    replies: [
      {
        author: 'glitch',
        hoursAfter: 1,
        message:
          'Fifth. On a different team to Wraith. I am not saying they are connected, I am pointing at them.',
      },
      { author: 'wraith', hoursAfter: 3, message: 'They are connected. I carry you.' },
      {
        author: 'cormac',
        hoursAfter: 6,
        message:
          'Top of the U18s and I have three weeks left before I am eighteen, so this is my whole legacy.',
      },
      { author: 'pixel', hoursAfter: 9, message: 'Three points off. Two weeks left. It is on.' },
      {
        author: 'bram',
        hoursAfter: 20,
        message:
          "Clipped the last round of week six, it is up in Photos and clips. Sunny's face at the end is worth it on its own.",
      },
    ],
  },
  {
    forum: 'events',
    author: 'tinker',
    title: 'Tuesday raid night: roster and sign-ups',
    daysAgo: 4,
    prefix: 'signup',
    message: [
      'Tuesday, half eight, same as every Tuesday for two years.',
      '',
      'Sign up by Monday night. Roster goes up Monday and if you are on it and do not turn up, you are behind the people who did next week — that is the whole discipline system and it has never needed to be more than that.',
      '',
      'Two spots for anyone who has never done one. You will not be shouted at. Somebody will explain the whole thing badly and then Pixel will explain it properly.',
    ].join('\n'),
    replies: [
      {
        author: 'pixel',
        hoursAfter: 1,
        message: 'In, and I will take the new people. It is genuinely my favourite part.',
      },
      { author: 'mango', hoursAfter: 2, message: 'In.' },
      { author: 'sunny', hoursAfter: 3, message: 'In. Not Wednesday. It is Tuesday. I know.' },
      { author: 'rook', hoursAfter: 6, message: 'In. Never done one. Terrified in a fun way.' },
      {
        author: 'bolt',
        hoursAfter: 8,
        message:
          'In, and I can take the other new slot person through the first bit if Pixel is busy.',
      },
      {
        author: 'wraith',
        hoursAfter: 11,
        message: 'In, and I am on time this week, and I will hear no commentary about that.',
      },
      {
        author: 'tinker',
        hoursAfter: 20,
        message:
          'Roster is up. Eighteen signed up for fourteen places, which is a lovely problem — the four who miss out are first on next week.',
      },
    ],
  },
  {
    forum: 'events',
    author: 'dara',
    title: "Saturday: home to St Bridget's, 2pm",
    daysAgo: 2,
    prefix: 'fixture',
    message: [
      'Home game, 2pm, and it is the first one back on our own pitch since the closure.',
      '',
      'Gerry wants the far side of the pitch left alone at half time — no warm-ups, no children, no dogs. Two weeks of dry weather does not undo three weeks of rain.',
      '',
      'Soup, teas and the raffle in the clubhouse afterwards. Bring change.',
    ].join('\n'),
    replies: [
      {
        author: 'gerry',
        hoursAfter: 2,
        message:
          'Far side. Nobody on it. I will be watching and I have nothing else to do on a Saturday.',
      },
      {
        author: 'marty',
        hoursAfter: 5,
        message: 'Squad is up. Shay is back, Oisín is suspended, and I have named Cormac.',
      },
      { author: 'cormac', hoursAfter: 6, message: 'First start. Going to be sick.' },
      {
        author: 'oisin',
        hoursAfter: 9,
        message:
          'One booking in November and one in January and apparently that is a suspension. I will be behind the goal shouting.',
      },
      {
        author: 'sam',
        hoursAfter: 20,
        message: 'Dog will be on the near side, on a lead, being extremely well behaved.',
      },
      {
        author: 'gerry',
        hoursAfter: 22,
        quotes: 5,
        message: 'The dog is the only one of you I trust.',
      },
      {
        author: 'bernie',
        hoursAfter: 30,
        message: 'Two seats going from the far end of the village if anyone needs a lift up.',
      },
    ],
  },
]
