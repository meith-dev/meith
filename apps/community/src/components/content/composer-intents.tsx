import { buttonVariants } from '@meith/ui'

import { PendingButton } from '../auth/form-controls'
import { fromCopy, useCopy } from '../shell/copy'

export function ComposerIntents() {
  const copy = useCopy()
  return (
    <>
      <PendingButton
        name="intent"
        value="preview"
        showWorking
        className={buttonVariants({ variant: 'outline' })}
      >
        {fromCopy(copy, 'composer.preview')}
      </PendingButton>
      <PendingButton
        name="intent"
        value="save_draft"
        showWorking
        className={buttonVariants({ variant: 'ghost' })}
      >
        {fromCopy(copy, 'composer.saveDraft')}
      </PendingButton>
    </>
  )
}
