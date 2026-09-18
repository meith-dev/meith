# Configure reputation and thanks

Configure reputation under **Board settings → Reputation** (`/admin/settings?group=reputation`). Group permissions control who may rate and their daily allowance.

## Choose the board settings

| Setting | Effect |
|---|---|
| Reputation enabled | Shows rating controls and totals; turning it off preserves existing ratings |
| Allow negative ratings | Allows negative as well as positive ratings; off by default |
| Require a comment | Requires an explanation and removes one-click Thanks |
| Posts required before rating | Minimum post count; default 5, or 0 to remove the requirement |

A rating is −1, 0 or +1, without a group multiplier. Comments may contain up to 500 characters. Ratings can be associated with a post or a member profile.

## Understand the controls members see

| Negative ratings | Comment required | Post controls |
|---|---|---|
| Off | No | Thanks |
| Off | Yes | Rating form |
| On | No | Thanks and rating form |
| On | Yes | Rating form |

Choose the combination that fits the community, save it, and check a post using an ordinary member account.

## Set permissions and limits

The member needs **Can give reputation**, enough posts and remaining daily allowance. Members cannot rate themselves. A group's numeric allowance combines with other groups using the most generous value; zero is unlimited. The day resets at midnight UTC.

A member can withdraw a rating they gave. Totals are recomputed from current ratings when they change, including account merges; there is no operator recount step for ordinary rating changes.

## Check related features

Promotion rules and optional achievement plugins can use reputation as an eligibility criterion. Consider those rules before changing reputation policy.

For group settings, see [Groups and promotions](groups.md). For imported ratings, see [MyBB account differences](../operations/mybb-members.md).
