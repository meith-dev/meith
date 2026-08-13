import type { DemoThread } from './types'

/**
 * The two forums not everybody can see.
 *
 * Both are ordinary forums with permission overrides on them, and the content
 * is written to be worth finding: a visitor who logs in as `admin` and lands in
 * the committee room should see the kind of conversation that is genuinely not
 * for the whole board, rather than a thread that says "this is private".
 */
export const PRIVATE_THREADS: readonly DemoThread[] = [
  // ── Supporters' room ───────────────────────────────────────────────────────
  {
    forum: 'supporters',
    author: 'admin',
    title: "What actually happens in the Supporters' room",
    daysAgo: 300,
    sticky: true,
    message: [
      'You are in here because you pay a few euro a month on top of your membership. Thank you — it is currently paying for the juvenile jerseys and about a third of the mower.',
      '',
      'What you get in here: the accounts before they go to the AGM, the kit designs before anyone else sees them, and the odd bit of news a week early.',
      '',
      'What you do **not** get: any say the rest of the club does not have. No vote, no priority on tickets, nothing that would make this a club with a first class and a second class. That was the one line the committee would not cross and I would not want it crossed either.',
      '',
      'The room appears and disappears on its own — if you stop the plan, it goes, and if you start it again, it comes back. Nobody has to remember to let you in.',
    ].join('\n'),
    replies: [
      { author: 'rosa', hoursAfter: 9, message: 'The "no say the rest of the club does not have" line is why I signed up. A room is fine. A vote would not have been.' },
      { author: 'tomas', hoursAfter: 26, message: 'Seeing the kit before it is public is genuinely the best perk and it costs the club nothing.' },
      { author: 'ken', hoursAfter: 50, message: 'I got in here as a gift from Tomás and I have no idea how to say thank you without it being awkward, so: thanks.' },
      { author: 'mira', hoursAfter: 200, message: 'Two years in. It is a fiver. The jerseys exist. That is the whole review.' },
    ],
  },
  {
    forum: 'supporters',
    author: 'dev',
    title: 'Honest question to the room: is it worth it?',
    daysAgo: 90,
    message: [
      'Asking as somebody who has been paying for a year and is renewing without really thinking about it.',
      '',
      'Not a complaint. I would just like to hear from people whether they feel it does anything, because if the answer is "not really" the club should hear that too.',
    ].join('\n'),
    replies: [
      { author: 'olu', hoursAfter: 4, message: 'Honestly? The room is a nice-to-have. The reason I pay is that the U10s have jerseys and I can see the line in the accounts that says so.' },
      { author: 'rosa', hoursAfter: 9, message: 'Same. It is a standing order I never think about and it does more than the €5 would do anywhere else in my month.' },
      { author: 'sam', hoursAfter: 20, message: 'I stopped for three months when work got tight and nobody said a word to me about it, which is exactly how it should be handled.' },
      { author: 'admin', hoursAfter: 26, message: 'Nobody knows who has stopped except the treasurer and the software. There is no list on a wall and there never will be.' },
      { author: 'dev', hoursAfter: 44, message: 'That is the answer I was hoping for. Renewed, without thinking about it, on purpose this time.' },
    ],
  },
  {
    forum: 'supporters',
    author: 'tomas',
    title: 'First look at next season\'s jersey',
    daysAgo: 60,
    message: [
      'Three designs back from the new supplier. All three keep the green and the hoop, because the one time we changed that in 2008 there was nearly a schism.',
      '',
      'The third one has the fiftieth-anniversary crest on it. That is the one I want and I am not neutral.',
      '',
      'Say what you think in here and I will bring it to the committee before it goes near the club.',
    ].join('\n'),
    replies: [
      { author: 'ken', hoursAfter: 5, message: 'Third. Not close. The anniversary crest will be the reason people who have not bought a jersey in ten years buy one.' },
      { author: 'mira', hoursAfter: 11, message: 'Third, and put the year on the back of the collar where only the person wearing it sees it.' },
      { author: 'tomas', hoursAfter: 14, quotes: 2, message: 'That is a lovely idea and it costs about eighty cent a jersey. Taking it to the committee as if I thought of it.' },
      { author: 'siobhan', hoursAfter: 26, message: 'Committee will approve the third one. The 2008 conversation is not being reopened by me or anybody else.' },
      { author: 'rosa', hoursAfter: 50, message: 'Nineteen replies in the supporters room and not one row. The main board would have had six pages by now.' },
    ],
  },
  {
    forum: 'supporters',
    author: 'siobhan',
    title: 'Where your money went this quarter',
    daysAgo: 45,
    message: [
      'Supporters plans brought in **€1,180** over the quarter, from thirty-one of you.',
      '',
      '- Juvenile jerseys, two sets: **€740**',
      '- Mower service: **€240**',
      '- Nets and corner flags: **€120**',
      '- Left in the account: **€80**',
      '',
      'That is all of it. The same figures go to the AGM in a fortnight, and you are seeing them first because that is the deal.',
    ].join('\n'),
    replies: [
      { author: 'olu', hoursAfter: 6, message: 'Four lines and a total. Every club in the country should do this and about four of them do.' },
      { author: 'dev', hoursAfter: 14, message: 'The €80 left over is my favourite number in the post. It means it is actually being spent on the thing.' },
      { author: 'ken', hoursAfter: 30, message: 'Would it be worth putting a version of this on the open board? Not the room-first bit, the "here is what it bought" bit.' },
      { author: 'siobhan', hoursAfter: 44, quotes: 3, message: 'Yes, and I will. A week later, so the room keeps its head start, but the club should see it.' },
    ],
  },
  {
    forum: 'supporters',
    author: 'rosa',
    title: 'The draw: it was Gerry, and he has handed it straight back',
    daysAgo: 25,
    message: [
      'The quarterly draw came out of the hat this morning and it was Gerry, who has been in it for two years without winning anything.',
      '',
      'He has given the €500 back to the pitch fund. I argued with him for ten minutes and lost.',
    ].join('\n'),
    replies: [
      { author: 'mira', hoursAfter: 3, message: 'Of course he did.' },
      { author: 'tomas', hoursAfter: 9, message: 'Somebody buy that man something he cannot refuse. A jacket. He has worn the same one since 2015.' },
      { author: 'admin', hoursAfter: 20, message: 'Committee is buying him a jacket and he is not being consulted about it.' },
      { author: 'sam', hoursAfter: 30, message: 'The anonymous €500 in the accounts last year was him as well, by the way. I was standing there.' },
    ],
  },
  {
    forum: 'supporters',
    author: 'siobhan',
    title: 'AGM papers, a week early',
    daysAgo: 10,
    message: [
      'Accounts, the drainage quote and the two constitution changes are attached, a week before they go to the club.',
      '',
      'If something in the accounts does not make sense, ask me in here where it is a question rather than in the room on the night where it sounds like an accusation. That is genuinely why you get them early.',
    ].join('\n'),
    replies: [
      { author: 'dev', hoursAfter: 5, message: 'Why is the insurance line up 22%? Not a challenge, I just cannot see a reason in the notes.' },
      { author: 'siobhan', hoursAfter: 8, quotes: 1, message: 'Because we added the gaming side to the policy and the broker rated it as a new activity. It comes down next year when it has a claims history. Good question and it should have been in the notes.' },
      { author: 'olu', hoursAfter: 20, message: 'Same question was in my head. This is exactly the use for this room.' },
      { author: 'rosa', hoursAfter: 30, message: 'Two of us reading them a week early has already caught a missing note. That is worth more than the room being a perk.' },
    ],
  },

  // ── Committee room ─────────────────────────────────────────────────────────
  {
    forum: 'committee',
    author: 'admin',
    title: 'What goes in here and what does not',
    daysAgo: 320,
    sticky: true,
    locked: true,
    message: [
      'This forum is invisible to everybody outside the three staff groups. That is a permissions setting on this forum, not a secret system, and any administrator can see exactly who can read it from the permissions screen.',
      '',
      '**In here:** anything about an individual member, safeguarding, money before it is decided, and drafts.',
      '',
      '**Not in here:** anything that could go on the open board. If a decision is made in this forum, the decision goes out there with a reason attached. A committee that decides in private and announces without reasons is how a club loses people.',
      '',
      'Assume everything you write here will be read out at some point. It is private, not deniable.',
    ].join('\n'),
  },
  {
    forum: 'committee',
    author: 'mairead',
    title: 'Two safeguarding refreshers are due this month',
    daysAgo: 34,
    message: [
      'Two of the juvenile coaches have training that runs out this month and one has vetting that lapses in March.',
      '',
      'I have messaged all three. Nobody is off the pitch yet, but the rule is the rule and if the refresher has not happened by the end of the month, they are off the pitch.',
      '',
      'Flagging it here so it is nobody\'s surprise, mine included.',
    ].join('\n'),
    replies: [
      { author: 'siobhan', hoursAfter: 3, message: 'Correct, and the club pays for all three. If cost is the reason for a delay, that reason is gone.' },
      { author: 'admin', hoursAfter: 9, message: 'Can we put the expiry dates somewhere that shouts before it is urgent? This is the second time it has come up with three weeks to go.' },
      { author: 'mairead', hoursAfter: 20, quotes: 2, message: 'I keep them in a spreadsheet and the spreadsheet does not shout. Open to anything better.' },
      { author: 'dara', hoursAfter: 44, message: 'A thread in here per coach with the date in the title, and subscribe to it. Ugly and it would work.' },
      { author: 'mairead', hoursAfter: 200, message: 'All three done with a fortnight to spare. Doing Dara\'s ugly thing for the next lot.' },
    ],
  },
  {
    forum: 'committee',
    author: 'siobhan',
    title: 'AGM agenda draft — pull it apart before I send it',
    daysAgo: 20,
    message: [
      'Draft is below. I have deliberately put the drainage vote before the constitution changes, because the constitution ones will take an hour and the drainage is the thing people came for.',
      '',
      'Two things I am unsure about: whether to put the treasurer vacancy at the top where it is unavoidable, and whether Vex should speak to the gaming section changes rather than me.',
    ].join('\n'),
    replies: [
      { author: 'admin', hoursAfter: 4, message: 'Vex should speak to it. It is his section and it will land better from him than from the chair.' },
      { author: 'vex', hoursAfter: 8, message: 'Happy to. I will keep it to three minutes and I will not read the paragraphs out — everybody has them a week early.' },
      { author: 'dara', hoursAfter: 11, message: 'Treasurer vacancy at the top. Put it where nobody can leave before it comes up.' },
      { author: 'kev', hoursAfter: 26, message: 'One addition: somebody should say out loud that Noelle is not being pushed. There is a version of this that goes round the village wrongly by Thursday.' },
      { author: 'siobhan', hoursAfter: 30, quotes: 4, message: 'That is a very good point and it is going in the notice, not just the meeting.' },
      { author: 'moderator', hoursAfter: 50, message: 'Agenda reads well. The only thing missing is a time. People will genuinely not come if they do not know whether it is an hour or three.' },
    ],
  },
  {
    forum: 'committee',
    author: 'admin',
    title: 'Treasurer handover: what we tell people the job actually is',
    daysAgo: 12,
    message: [
      'Noelle has written out what she does month by month and the honest total is about four hours in January and twenty minutes in July.',
      '',
      'We have been saying "a couple of hours a week" for six years, which is both wrong and off-putting. I want the notice to say the real numbers.',
      '',
      'The other thing worth saying: since the subs went online, the counting is gone. That was most of the job and it is not part of the job any more.',
    ].join('\n'),
    replies: [
      { author: 'siobhan', hoursAfter: 3, message: 'Agreed on the real numbers. Nobody has ever taken a volunteer role because the estimate was vague.' },
      { author: 'dara', hoursAfter: 9, message: 'Put both sentences in the notice. "Four hours in January, twenty minutes in July, and the counting is gone" is the whole pitch.' },
      { author: 'kev', hoursAfter: 20, message: 'Two people have asked me quietly about it since the AGM thread went up. They both assumed it was a bookkeeping job and they both do that for a living.' },
      { author: 'admin', hoursAfter: 30, quotes: 3, message: 'Then we have two candidates and a wording problem, which is the best kind of problem.' },
    ],
  },
  {
    forum: 'committee',
    author: 'kev',
    title: 'A member has asked us to delete their account and everything they wrote',
    daysAgo: 8,
    message: [
      'Left the club in the autumn on decent terms and has asked for the account and all their posts to be removed.',
      '',
      'The account is straightforward. The posts are not — they are in about forty threads including two long ones about the pitch fund, and pulling them leaves holes in conversations other people are quoted in.',
      '',
      'What do we do, and is there a policy? I do not think there is a policy.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 4,
        message:
          'There is not, and there should be. What the software does: it can delete the account and keep the posts under a placeholder name, or delete both. The first keeps the threads readable, the second is what somebody usually means when they ask.',
      },
      { author: 'siobhan', hoursAfter: 9, message: 'Ask them which they meant. Most people mean "take my name off it", and when you offer that specifically they take it.' },
      { author: 'moderator', hoursAfter: 20, message: 'And whichever they pick, do it inside a week and tell them when it is done. The waiting is what turns a polite request into a row.' },
      { author: 'kev', hoursAfter: 30, message: 'Asked. They wanted the name off it, not the posts gone. Done this morning and they were grateful.' },
      { author: 'siobhan', hoursAfter: 44, message: 'Writing that up as an actual policy this week, in three sentences, and it goes in the open moderation forum rather than staying in here.' },
    ],
  },
  {
    forum: 'committee',
    author: 'dara',
    title: 'Staff cover for the next month',
    daysAgo: 5,
    message: [
      'I am away for two weeks from the 18th and Tinker is on nights, so the queue needs somebody.',
      '',
      'It is about four clicks a day. The only thing that genuinely needs a person is the first-post queue, because a new member waiting six hours for approval is a new member who thinks nobody is here.',
    ].join('\n'),
    replies: [
      { author: 'moderator', hoursAfter: 2, message: 'I will take the queue for the fortnight. I am on it most evenings anyway.' },
      { author: 'mairead', hoursAfter: 6, message: 'And I will pick up anything juvenile-related, as usual, whoever is on.' },
      { author: 'vex', hoursAfter: 11, message: 'I am up at odd hours for the roster anyway. Give me the overnight approvals and the queue will never be more than an hour old.' },
      { author: 'admin', hoursAfter: 20, quotes: 3, message: 'That is genuinely the best use of a person in a different timezone that anybody has proposed. Done.' },
      { author: 'dara', hoursAfter: 26, message: 'Covered in half a day. Whoever said a committee cannot organise anything has not tried asking for something small and specific.' },
    ],
  },
  {
    forum: 'committee',
    author: 'moderator',
    title: 'The ticket spam: how do we want to word the reply?',
    daysAgo: 2,
    message: [
      'The reported post in Buy, sell and swap is obvious spam and I will bin it. Two questions before I do.',
      '',
      'First: do we say anything publicly? Petra\'s thread is a nice thread and it now has a spam reply in the middle of it.',
      '',
      'Second: the member who reported it got no acknowledgement beyond the automatic one, and I keep thinking we should say thanks by hand. Or is that a rod for our own backs?',
    ].join('\n'),
    replies: [
      { author: 'kev', hoursAfter: 3, message: 'Bin it, no public note. A thread about a deleted spam post is more spam attention than the spam got.' },
      { author: 'admin', hoursAfter: 6, message: 'On the thanks: do it while it is rare. If we are ever getting twenty reports a week we will have bigger problems and can stop then.' },
      { author: 'siobhan', hoursAfter: 9, message: 'Agreed both. And the report form wording could say what happens next, which would do most of the reassuring on its own.' },
      { author: 'moderator', hoursAfter: 20, message: 'Leaving the post up until whoever is on next has seen it, then it goes. It is worth one person seeing what a real one looks like in the queue.' },
    ],
  },
]
