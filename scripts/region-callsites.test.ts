import { describe, expect, it } from 'vitest'

import { knownRegions, regionCallSites, scanRegionCallSites } from './region-callsites.mjs'

describe('knownRegions', () => {
  it('reads every region out of the registry, including admin.dashboard', async () => {
    const known = await knownRegions()
    expect(known.has('admin.dashboard')).toBe(true)
    expect(known.size).toBeGreaterThanOrEqual(7)
  })
})

describe('regionCallSites', () => {
  const known = new Set(['index.footer', 'admin.dashboard'])

  it('records the file that renders a region', () => {
    const { wired, problems } = regionCallSites(
      [
        {
          rel: 'apps/community/app/(board)/page.tsx',
          source: "boardRegion('index.footer', actor)",
        },
        {
          rel: 'apps/community/app/admin/page.tsx',
          source: "boardRegion('admin.dashboard', actor, PLUGIN_CARD)",
        },
      ],
      known,
    )

    expect(problems).toEqual([])
    expect(wired.get('admin.dashboard')).toEqual(['apps/community/app/admin/page.tsx'])
  })

  it('leaves a region with no call site out of the wired set — the failure the gate reports', () => {
    const { wired } = regionCallSites(
      [
        {
          rel: 'apps/community/app/(board)/page.tsx',
          source: "boardRegion('index.footer', actor)",
        },
      ],
      known,
    )

    const missing = [...known].filter((name) => !wired.has(name))
    expect(missing).toEqual(['admin.dashboard'])
  })

  it('counts the batch helper as the call site for threadrow.badges', () => {
    const { wired, problems } = regionCallSites(
      [
        {
          rel: 'apps/community/app/(board)/[slug]/page.tsx',
          source: 'const badges = await threadRowBadges(actor, subjects)',
        },
      ],
      new Set(['index.footer', 'threadrow.badges']),
    )

    expect(problems).toEqual([])
    expect(wired.get('threadrow.badges')).toEqual(['apps/community/app/(board)/[slug]/page.tsx'])
  })

  it('flags a call site that renders a region the registry does not declare', () => {
    const { problems } = regionCallSites(
      [{ rel: 'apps/community/app/x.tsx', source: "pluginRegion('admin.dashbrd', context)" }],
      known,
    )

    expect(problems).toEqual([
      'apps/community/app/x.tsx: renders "admin.dashbrd", which is not a region in the registry',
    ])
  })
})

describe('scanRegionCallSites', () => {
  it('finds a call site in apps/community for every declared region', async () => {
    const { missing, problems, wired } = await scanRegionCallSites()

    expect(problems).toEqual([])
    expect(missing).toEqual([])
    expect(wired.get('admin.dashboard')).toContain('apps/community/app/admin/page.tsx')
  })
})
