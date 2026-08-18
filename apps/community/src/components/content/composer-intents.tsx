import { buttonVariants } from '@meith/ui'

import { fromCopy, useCopy } from '../shell/copy'

export function ComposerIntents() {
  const copy = useCopy()
  return (
    <>
      <button
        type="submit"
        name="intent"
        value="preview"
        className={buttonVariants({ variant: 'outline' })}
      >
        {fromCopy(copy, 'composer.preview')}
      </button>
      <button
        type="submit"
        name="intent"
        value="save_draft"
        className={buttonVariants({ variant: 'ghost' })}
      >
        {fromCopy(copy, 'composer.saveDraft')}
      </button>
    </>
  )
}
