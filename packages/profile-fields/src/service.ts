/**
 * F59 — the profile-field service.
 *
 * Reading is a filter (`resolve.ts`); this is where **writing** happens, and
 * every rule here exists because a member's answer is attacker-controlled text
 * that ends up on a page other members read.
 *
 * Three of them are worth stating:
 *
 *  - **A submitted field id is never trusted.** The save path resolves what
 *    this actor may edit and writes only that, so posting somebody else's
 *    staff-only field writes nothing rather than being refused with an error
 *    that confirms the field exists.
 *  - **A `select` value must be one of the configured options.** Otherwise the
 *    field is a free-text box wearing a dropdown, and the operator who chose a
 *    fixed list did so for a reason.
 *  - **A `url` is normalised to http(s) or refused**, because a profile field
 *    rendered as a link is an attacker-controlled `href` — the same argument
 *    F36 makes about `[url]` and F57 makes about the website field.
 */
import { ValidationError } from '@forum/core'

import { editableFields, maxLengthFor, visibleFields } from './resolve'
import type {
  ProfileFieldDefinition,
  ProfileFieldGroupRule,
  ProfileFieldRepository,
  ProfileFieldValue,
  ResolvedProfileField,
} from './types'

/** What the caller has already resolved about the actor's groups (F20). */
export interface ProfileFieldContext {
  /** The per-group rules that apply to this actor, filtered by the Authorizer. */
  readonly applicable: readonly ProfileFieldGroupRule[]
}

export class ProfileFieldService {
  private readonly repository: ProfileFieldRepository

  constructor(deps: { fields: ProfileFieldRepository }) {
    this.repository = deps.fields
  }

  /** Every field, for the operator CLI. Configuration, not a member view. */
  async listAll(): Promise<readonly ProfileFieldDefinition[]> {
    return this.repository.listFields()
  }

  async listGroupRules(): Promise<readonly ProfileFieldGroupRule[]> {
    return this.repository.listGroupRules()
  }

  /**
   * What a viewer may see on somebody's profile.
   *
   * `context` is the *viewer's*, `userId` is the profile owner's — and getting
   * those the wrong way round is the mistake this signature is shaped to make
   * hard to write.
   */
  async visibleFor(
    userId: number,
    context: ProfileFieldContext,
  ): Promise<readonly ResolvedProfileField[]> {
    const [fields, values] = await Promise.all([
      this.repository.listFields(),
      this.repository.valuesFor(userId),
    ])

    return visibleFields({
      fields,
      applicable: context.applicable,
      values: byField(values),
    })
  }

  /** What a member may fill in about themselves. */
  async editableFor(
    userId: number,
    context: ProfileFieldContext,
  ): Promise<readonly ResolvedProfileField[]> {
    const [fields, values] = await Promise.all([
      this.repository.listFields(),
      this.repository.valuesFor(userId),
    ])

    return editableFields({
      fields,
      applicable: context.applicable,
      values: byField(values),
    })
  }

  /**
   * The fields the registration form asks for (F18).
   *
   * Resolved against the *registered* group's rules rather than the applicant's,
   * because an applicant has no groups yet — they are about to get one. A field
   * that group may not edit is not asked for, which keeps "what you are asked
   * at registration" consistent with "what you may change afterwards".
   */
  async requiredAtRegistration(
    context: ProfileFieldContext,
  ): Promise<readonly ProfileFieldDefinition[]> {
    const fields = await this.repository.listFields()

    return editableFields({
      fields,
      applicable: context.applicable,
      values: new Map(),
    })
      .filter((resolved) => resolved.field.requiredAtRegistration)
      .map((resolved) => resolved.field)
  }

  /**
   * Save a member's answers.
   *
   * `submitted` is keyed by field **key**, not id: a form posts names, and a
   * key is the stable identifier an operator sees. Anything not in the
   * resolved-editable set is dropped silently — see the header for why that is
   * a refusal rather than an error.
   */
  async save(input: {
    readonly userId: number
    readonly submitted: ReadonlyMap<string, string>
    readonly context: ProfileFieldContext
  }): Promise<void> {
    const editable = await this.editableFor(input.userId, input.context)

    const values: ProfileFieldValue[] = []
    for (const resolved of editable) {
      const raw = input.submitted.get(resolved.field.key)
      /*
       * Absent means "this form did not offer it", which is different from
       * "cleared" — a partial form must not wipe fields it never rendered.
       */
      if (raw === undefined) continue
      values.push({ fieldId: resolved.field.id, value: validate(resolved.field, raw) })
    }

    if (values.length > 0) {
      await this.repository.saveValues({ userId: input.userId, values })
    }
  }

  /**
   * Validate registration answers before an account exists.
   *
   * Returns the values to write once it does. Required fields are enforced
   * here, because "you must tell us X" is a registration rule and refusing it
   * *after* creating the account would leave a member the board considers
   * incomplete.
   */
  async validateRegistration(input: {
    readonly submitted: ReadonlyMap<string, string>
    readonly context: ProfileFieldContext
  }): Promise<readonly ProfileFieldValue[]> {
    const required = await this.requiredAtRegistration(input.context)

    return required.map((field) => {
      const raw = (input.submitted.get(field.key) ?? '').trim()
      if (raw === '') throw new ValidationError(`${field.label} is required.`)
      return { fieldId: field.id, value: validate(field, raw) }
    })
  }

  /**
   * Write the values `validateRegistration` returned, once the account exists.
   *
   * Deliberately separate from `save()` and deliberately *not* re-resolving:
   * the values were already validated against the fields the default member
   * group may edit, and re-resolving would mean building a context for an actor
   * that is one query old. Splitting validation from the write is what lets the
   * caller refuse a registration before it creates anything.
   */
  async applyRegistration(
    userId: number,
    values: readonly ProfileFieldValue[],
  ): Promise<void> {
    if (values.length === 0) return
    await this.repository.saveValues({ userId, values })
  }

  /* ---- The operator surface, until F71's screen exists ---- */

  async create(input: {
    readonly key: string
    readonly label: string
    readonly type: string
    readonly options: readonly string[]
    readonly requiredAtRegistration?: boolean
    readonly showInPostbit?: boolean
    readonly displayOrder?: number
  }): Promise<ProfileFieldDefinition> {
    const key = input.key.trim().toLowerCase()
    /*
     * The key becomes a form field name and a CLI argument, so it is
     * constrained to what both handle without quoting.
     */
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) {
      throw new ValidationError(
        'A field key must be 2–40 characters: a letter, then letters, digits or underscores.',
      )
    }

    const label = input.label.trim()
    if (label === '') throw new ValidationError('A field needs a label.')

    const type = parseType(input.type)
    if (type === 'select' && input.options.length === 0) {
      throw new ValidationError('A dropdown needs at least one option.')
    }

    if (await this.repository.findByKey(key)) {
      throw new ValidationError(`A field with the key "${key}" already exists.`)
    }

    return this.repository.create({
      key,
      label,
      type,
      options: input.options,
      requiredAtRegistration: input.requiredAtRegistration ?? false,
      showInPostbit: input.showInPostbit ?? false,
      displayOrder: input.displayOrder ?? 0,
    })
  }

  async remove(key: string): Promise<boolean> {
    return this.repository.remove(key.trim().toLowerCase())
  }
}

function byField(values: readonly ProfileFieldValue[]): ReadonlyMap<number, string> {
  return new Map(values.map((value) => [value.fieldId, value.value]))
}

function parseType(value: string): ProfileFieldDefinition['type'] & string {
  const type = value.trim().toLowerCase()
  if (
    type === 'text' ||
    type === 'textarea' ||
    type === 'select' ||
    type === 'checkbox' ||
    type === 'url' ||
    type === 'number'
  ) {
    return type
  }
  throw new ValidationError(`"${value}" is not a field type.`)
}

/**
 * One answer, checked against its field.
 *
 * An **unknown type validates as text**, deliberately: the field was written by
 * a deploy that knew a type this build does not, and refusing every save until
 * somebody upgrades would make a downgrade lock members out of their own
 * profile. Text is the safe reading — it is stored and rendered as text either
 * way.
 */
function validate(field: ProfileFieldDefinition, raw: string): string {
  const value = raw.trim()
  if (value === '') return ''

  const limit = maxLengthFor(field)
  if (value.length > limit) {
    throw new ValidationError(`${field.label} may be at most ${limit} characters.`)
  }

  switch (field.type) {
    case 'select':
      /*
       * A submitted value outside the list is refused rather than stored. The
       * operator who configured a fixed list did so for a reason, and a
       * dropdown that accepts anything is a text box in a costume.
       */
      if (!field.options.includes(value)) {
        throw new ValidationError(`${field.label} must be one of the offered choices.`)
      }
      return value

    case 'checkbox':
      /* A checkbox that is present is on; the form omits it when off. */
      return 'yes'

    case 'number':
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        throw new ValidationError(`${field.label} must be a number.`)
      }
      return value

    case 'url':
      return normaliseUrl(field, value)

    default:
      return value
  }
}

/**
 * A URL a page can safely link to.
 *
 * Only `http` and `https` survive. A profile field rendered as a link is an
 * attacker-controlled `href`, and `javascript:` in one is the oldest stored-XSS
 * vector there is. A bare `example.com` is given `https://` rather than
 * refused, because typing the scheme is not something anybody does.
 */
function normaliseUrl(field: ProfileFieldDefinition, value: string): string {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new ValidationError(`${field.label} must be a web address.`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`${field.label} must start with http:// or https://.`)
  }
  return url.toString()
}
