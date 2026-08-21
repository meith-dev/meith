import 'server-only'

import { idParam } from '@meith/api'
import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { parseRating } from '@meith/reputation'

import { getContainer } from '../container'
import { reputationService, reputationSettings, viewerRaterLimits } from '../reputation'
import { requireRateablePost } from '../reputation-target'
import {
  type ApiResult,
  type ApiRoutes,
  bodyId,
  bodyInteger,
  bodyText,
  notFound,
  requireUserId,
} from './http'

export const MEMBER_HANDLERS: ApiRoutes = [
  [
    'GET',
    '/me',
    async ({ actor, token }): Promise<ApiResult> => {
      const userId = requireUserId(actor)
      const profile = await getContainer().memberProfiles.findPublicById(userId)
      if (!profile) return notFound()

      return {
        status: 200,
        body: {
          data: {
            userId,
            username: profile.username,
            scopes: token === null ? [] : [...token.scopes],
          },
        },
      }
    },
  ],

  [
    'GET',
    '/members/:userId',
    async ({ actor, params }): Promise<ApiResult> => {
      const userId = idParam(params.userId)
      if (userId === null) return notFound()

      const { authorizer, memberProfiles } = getContainer()
      if (!authorizer.can(actor, 'profile.view')) return notFound()

      const profile = await memberProfiles.findPublicById(userId)
      if (!profile) return notFound()

      return {
        status: 200,
        body: {
          data: {
            id: profile.id,
            username: profile.username,
            title: profile.title,
            postCount: profile.postCount,
            joinedAt: profile.createdAt.toISOString(),
            lastActiveAt: profile.lastActiveAt === null ? null : profile.lastActiveAt.toISOString(),
            location: profile.location,
            website: profile.website,
            bio: profile.bio,
          },
        },
      }
    },
  ],

  [
    'POST',
    '/members/:userId/reputation',
    async ({ actor, params, body }): Promise<ApiResult> => {
      const userId = idParam(params.userId)
      if (userId === null) return notFound()

      const raterId = requireUserId(actor)
      const service = reputationService()
      if (service === null) {
        throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data'))
      }

      const submitted = bodyInteger(body, 'points')
      const points = submitted === null ? null : parseRating(String(submitted))
      if (points === null) throw new ValidationError(msg('error.app.rating'))

      const postId = bodyId(body, 'postId')
      await requireRateablePost(actor, userId, postId)
      const [settings, limits] = await Promise.all([reputationSettings(), viewerRaterLimits(actor)])

      await service.give({
        userId,
        givenByUserId: raterId,
        postId,
        points,
        comment: bodyText(body, 'comment'),
        settings,
        limits,
      })

      return { status: 201, body: { data: { userId } } }
    },
  ],
]
