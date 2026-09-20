# Publish an extension

The marketplace lists reviewed npm packages. Operators install packages in their own board repositories; a listing does not install or update code automatically.

## Prepare the package

1. Test the extension against the declared Meith and API versions.
2. Publish the package with its licence and source repository.
3. Capture screenshots of the extension in a board.
4. Add a listing under `marketplace/listings/` and PNG screenshots under `marketplace/screenshots/` in the Meith repository.

Include the package's kind (`plugin` or `theme`), stable key, package name, version, API version, supported `meith` range and screenshot filenames. Follow an existing listing for the complete schema.

Compatibility declarations must match tested behaviour. A range accepted by the parser does not prove the package works on every matching release.

## Submit the listing

From the Meith source checkout:

```sh
pnpm marketplace:gen
pnpm marketplace:gen:check
```

Commit the listing, screenshots and generated feed, then open a pull request. Review covers functionality, compatibility, licence, declared network access and screenshot accuracy.

Update the listing when publishing a new package version. Do not edit the generated public feed directly. See [Marketplace maintenance](../contributing/marketplace-maintenance.md) for validation and delisting.
