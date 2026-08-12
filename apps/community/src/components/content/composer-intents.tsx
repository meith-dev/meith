import { buttonVariants } from "@meith/ui"

export function ComposerIntents() {
  return (
    <>
      <button
        type="submit"
        name="intent"
        value="preview"
        className={buttonVariants({ variant: "outline" })}
      >
        Preview
      </button>
      <button
        type="submit"
        name="intent"
        value="save_draft"
        className={buttonVariants({ variant: "ghost" })}
      >
        Save draft
      </button>
    </>
  )
}
