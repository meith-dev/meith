import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 7 as number | null,
  activate: vi.fn(async (_token: string) => ({ outcome: 'activated', userId: 7 })),
  confirm: vi.fn(async (_token: string, _userId: number) => ({
    userId: 7,
    previousEmail: 'old@example.test',
    email: 'new@example.test',
  })),
  emit: vi.fn(),
  notice: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path)
  },
  notFound: () => {
    throw new Error('not found')
  },
}))
vi.mock('@meith/accounts', () => ({
  MemberSettingsService: class {
    confirmEmailChange = state.confirm
  },
}))
vi.mock('./container', () => ({
  configuredIdentity: async () => ({ activateAccount: state.activate }),
  getContainer: () => ({ memberSettings: {}, accountStore: {} }),
}))
vi.mock('./context', () => ({ getActor: async () => ({ userId: state.userId }) }))
vi.mock('./auth-events', () => ({ recordAuthEvent: async () => undefined }))
vi.mock('./i18n', () => ({ tr: async (key: string) => key, getTranslator: async () => ({}) }))
vi.mock('./plugin-view', () => ({ emitEvent: state.emit }))
vi.mock('./usercp-mail', () => ({ sendEmailChangeNotice: state.notice }))
vi.mock('@/components/auth/auth-page', () => ({ AuthPage: () => null }))
vi.mock('@/components/auth/form-controls', () => ({ SubmitButton: () => null }))

const { confirmAccountAction, confirmEmailChangeAction } = await import('./confirmation-actions')
const { default: VerifyPage } = await import('../../app/(auth)/verify/page')
const { default: ConfirmEmailPage } = await import('../../app/(board)/usercp/email/confirm/page')

beforeEach(() => {
  state.userId = 7
  vi.clearAllMocks()
})

function form(): FormData {
  const data = new FormData()
  data.set('token', 'valid-token')
  return data
}

describe('confirmation links', () => {
  it('renders both GET pages without consuming tokens or sending notices', async () => {
    const input = { searchParams: Promise.resolve({ token: 'valid-token' }) }
    await VerifyPage(input)
    await ConfirmEmailPage(input)
    expect(state.activate).not.toHaveBeenCalled()
    expect(state.confirm).not.toHaveBeenCalled()
    expect(state.emit).not.toHaveBeenCalled()
    expect(state.notice).not.toHaveBeenCalled()
  })

  it('activates only on the submitted account action', async () => {
    await expect(confirmAccountAction(form())).rejects.toThrow('/login?activated=1')
    expect(state.activate).toHaveBeenCalledWith('valid-token')
    expect(state.emit).toHaveBeenCalledWith('user.activated', { userId: 7 }, expect.any(Object))
  })

  it('confirms the email for the current actor on submission', async () => {
    await expect(confirmEmailChangeAction(form())).rejects.toThrow('/usercp/security?confirmed=1')
    expect(state.confirm).toHaveBeenCalledWith('valid-token', 7)
    expect(state.notice).toHaveBeenCalledTimes(1)
  })

  it('requires a signed-in actor again when the email action is submitted', async () => {
    state.userId = null
    await expect(confirmEmailChangeAction(form())).rejects.toThrow('/login')
    expect(state.confirm).not.toHaveBeenCalled()
  })
})
