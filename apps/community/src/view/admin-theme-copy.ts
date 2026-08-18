import type { Translator } from '@meith/i18n'

import { copyFor, patternCopy, splitAround } from './copy'
import { untranslated } from './time'

function splitTwice(
  t: Translator,
  key: string,
  first: string,
  second: string,
): readonly [string, string, string] {
  const rendered = t.t(key, { [first]: '\u0000', [second]: '\u0000' })
  const [lead = '', mid = '', tail = ''] = rendered.split('\u0000')
  return [lead, mid, tail]
}

export function oklchPickerCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'adminTheme.oklch.adjustColour',
        'adminTheme.oklch.hideSliders',
        'adminTheme.oklch.lightness',
        'adminTheme.oklch.chroma',
        'adminTheme.oklch.hue',
        'adminTheme.oklch.gamut',
        'adminTheme.oklch.clear',
      ],
      t,
    ),
    ...patternCopy(['adminTheme.oklch.adjust', 'adminTheme.oklch.hideSlidersFor'], t),
  }
}

export function themeStateCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  return {
    ...copyFor(
      [
        'adminTheme.state.makeDefault',
        'adminTheme.state.turnOn',
        'adminTheme.state.turnOff',
        'adminTheme.state.customise',
      ],
      t,
    ),
    ...patternCopy(
      [
        'adminTheme.state.makeDefaultFor',
        'adminTheme.state.turnOnFor',
        'adminTheme.state.turnOffFor',
        'adminTheme.state.customiseFor',
      ],
      t,
    ),
  }
}

export function themeAdminCopy(t: Translator = untranslated()): Readonly<Record<string, string>> {
  const [presetsBlurbLead, presetsBlurbTail] = splitAround(t, 'adminTheme.presets.blurb', 'name')
  const [cssHintLead, cssHintMid, cssHintTail] = splitTwice(
    t,
    'adminTheme.css.hint',
    'import',
    'url',
  )
  const [cssHintScopedLead, cssHintScopedMid, cssHintScopedTail] = splitTwice(
    t,
    'adminTheme.css.hintScoped',
    'root',
    'body',
  )
  const [cssUnsavedLead, cssUnsavedTail] = splitAround(t, 'adminTheme.changes.cssUnsaved', 'name')
  const [legibilityBlurbLead, legibilityBlurbMid, legibilityBlurbTail] = splitTwice(
    t,
    'adminTheme.legibility.blurb',
    'colorMix',
    'var',
  )
  const [clickNoteLead, clickNoteTail] = splitAround(t, 'adminTheme.preview.clickNote', 'strong')
  const [lastPostAdminLead, lastPostAdminTail] = splitAround(
    t,
    'adminTheme.sample.lastPostAdmin',
    'name',
  )
  const [lastPostModLead, lastPostModTail] = splitAround(t, 'adminTheme.sample.lastPostMod', 'name')
  const [breadcrumbLead, breadcrumbTail] = splitAround(t, 'adminTheme.sample.breadcrumb', 'title')
  const [ownPostLead, ownPostTail] = splitAround(t, 'adminTheme.sample.ownPost', 'link')

  return {
    ...oklchPickerCopy(t),
    ...copyFor(
      [
        'adminTheme.scheme.both',
        'adminTheme.scheme.light',
        'adminTheme.scheme.dark',
        'adminTheme.token.unsaved',
        'adminTheme.token.overridden',
        'adminTheme.token.usingOwn',
        'adminTheme.useThemesValue',
        'adminTheme.close',
        'adminTheme.editor.saved',
        'adminTheme.presets.title',
        'adminTheme.find.label',
        'adminTheme.find.placeholder',
        'adminTheme.find.nothingOverridden',
        'adminTheme.css.label',
        'adminTheme.css.hintDefault',
        'adminTheme.save',
        'adminTheme.previewWithoutSaving',
        'adminTheme.nothingToSave',
        'adminTheme.validated.title',
        'adminTheme.validated.blurb',
        'adminTheme.reset.done',
        'adminTheme.reset.submit',
        'adminTheme.import.done',
        'adminTheme.import.label',
        'adminTheme.import.hint',
        'adminTheme.import.submit',
        'adminTheme.changes.title',
        'adminTheme.changes.discardAll',
        'adminTheme.changes.live',
        'adminTheme.changes.unsavedCleared',
        'adminTheme.changes.nothingOverridden',
        'adminTheme.changes.ofWhich',
        'adminTheme.changes.stillPainting',
        'adminTheme.changes.allSaved',
        'adminTheme.changes.undoToTheme',
        'adminTheme.changes.undoToSaved',
        'adminTheme.legibility.title',
        'adminTheme.legibility.notMeasurable',
        'adminTheme.legibility.allPass',
        'adminTheme.legibility.on',
        'adminTheme.legibility.alreadyLike',
        'adminTheme.palette.changed',
        'adminTheme.palette.unsaved',
        'adminTheme.preview.title',
        'adminTheme.preview.blurb',
        'adminTheme.preview.clickNoteStrong',
        'adminTheme.preview.sceneGroup',
        'adminTheme.preview.scene.forums.title',
        'adminTheme.preview.scene.forums.blurb',
        'adminTheme.preview.scene.thread.title',
        'adminTheme.preview.scene.thread.blurb',
        'adminTheme.preview.scene.controls.title',
        'adminTheme.preview.scene.controls.blurb',
        'adminTheme.sample.boardName',
        'adminTheme.sample.signedInAs',
        'adminTheme.sample.category',
        'adminTheme.sample.announcements',
        'adminTheme.sample.introductions',
        'adminTheme.sample.archive',
        'adminTheme.sample.closedToNewPosts',
        'adminTheme.sample.pinnedThread',
        'adminTheme.sample.lockedThread',
        'adminTheme.sample.movedThread',
        'adminTheme.sample.threadTitle',
        'adminTheme.sample.pinned',
        'adminTheme.sample.awaitingApproval',
        'adminTheme.sample.supermodMeta',
        'adminTheme.sample.permalinkNote',
        'adminTheme.sample.adminMeta',
        'adminTheme.sample.ordinaryLink',
        'adminTheme.sample.bannedMeta',
        'adminTheme.sample.heldPost',
        'adminTheme.sample.postReply',
        'adminTheme.sample.hovered',
        'adminTheme.sample.previewButton',
        'adminTheme.sample.delete',
        'adminTheme.sample.threadTitleLabel',
        'adminTheme.sample.fieldNote',
        'adminTheme.sample.hoveredRow',
        'adminTheme.sample.moderationQueue',
        'adminTheme.sample.queueWaiting',
        'adminTheme.sample.queueApproved',
        'adminTheme.sample.queueRejected',
        'adminTheme.sample.queueDeleted',
      ],
      t,
    ),
    ...patternCopy(
      [
        'adminTheme.contrast.failIntro',
        'adminTheme.contrast.okIntro',
        'adminTheme.contrast.needs',
        'adminTheme.token.describes',
        'adminTheme.token.themesOwn',
        'adminTheme.token.replaces',
        'adminTheme.find.changedOnly',
        'adminTheme.find.shownCount',
        'adminTheme.group.changedCount',
        'adminTheme.group.tokenCount',
        'adminTheme.saveChanges',
        'adminTheme.unsavedChanges',
        'adminTheme.changes.valueCount',
        'adminTheme.changes.overriddenAcross',
        'adminTheme.changes.notSavedYet',
        'adminTheme.legibility.ratioNeeds',
        'adminTheme.legibility.passCount',
        'adminTheme.legibility.unknownCount',
        'adminTheme.legibility.everyPairIn',
        'adminTheme.sample.threadCount',
      ],
      t,
    ),
    'adminTheme.presets.blurbLead': presetsBlurbLead,
    'adminTheme.presets.blurbTail': presetsBlurbTail,
    'adminTheme.css.hintLead': cssHintLead,
    'adminTheme.css.hintMid': cssHintMid,
    'adminTheme.css.hintTail': cssHintTail,
    'adminTheme.css.hintScopedLead': cssHintScopedLead,
    'adminTheme.css.hintScopedMid': cssHintScopedMid,
    'adminTheme.css.hintScopedTail': cssHintScopedTail,
    'adminTheme.changes.cssUnsavedLead': cssUnsavedLead,
    'adminTheme.changes.cssUnsavedTail': cssUnsavedTail,
    'adminTheme.legibility.blurbLead': legibilityBlurbLead,
    'adminTheme.legibility.blurbMid': legibilityBlurbMid,
    'adminTheme.legibility.blurbTail': legibilityBlurbTail,
    'adminTheme.preview.clickNoteLead': clickNoteLead,
    'adminTheme.preview.clickNoteTail': clickNoteTail,
    'adminTheme.sample.lastPostAdminLead': lastPostAdminLead,
    'adminTheme.sample.lastPostAdminTail': lastPostAdminTail,
    'adminTheme.sample.lastPostModLead': lastPostModLead,
    'adminTheme.sample.lastPostModTail': lastPostModTail,
    'adminTheme.sample.breadcrumbLead': breadcrumbLead,
    'adminTheme.sample.breadcrumbTail': breadcrumbTail,
    'adminTheme.sample.ownPostLead': ownPostLead,
    'adminTheme.sample.ownPostTail': ownPostTail,
  }
}
