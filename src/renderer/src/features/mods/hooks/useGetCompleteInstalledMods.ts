import { useRef } from "react"
import { useGetInstalledMods } from "./useGetInstalledMods"
import { useQueryMod } from "./useQueryMod"
import semver from "semver"

export function useGetCompleteInstalledMods(): ({ path, version, onFinish }: { path: string; version: string; onFinish?: (updates: number) => void }) => Promise<{
  mods: InstalledModType[]
  errors: ErrorInstalledModType[]
}> {
  const getInstalledMods = useGetInstalledMods()
  const queryMod = useQueryMod()

  const availableModUpdates = useRef<number>(0)

  /**
   * Get the mods installed on the selected folder, query each mod from the moddb and add it to the mod, check if there is any update and add it to the mod.
   *
   * @param {Object} props
   * @param {string} [props.path] Path to look for mods.
   * @param {string} [props.version] Installation/Server version to check if there are compatible updates WITHOUT "v"! Example: ~~v1.2.3~~ 1.2.3
   * @param {(updates: number) => void} [props.onFinish] Fuction called before returning mods. Updates is the number of updates found.
   * @returns {Promise<{mods: InstalledModType[]errors: ErrorInstalledModType[]}>} Mods with ModDB mods and updates(if any) and mods with errors.
   */
  async function getCompleteInstalledMods({ path, version, onFinish }: { path: string; version: string; onFinish?: (updates: number) => void }): Promise<{
    mods: InstalledModType[]
    errors: ErrorInstalledModType[]
  }> {
    const mods = await getInstalledMods({
      path: path,
      onFinish: () =>
        window.api.utils.logMessage("info", `[front] [mods] [features/mods/hooks/useGetCompleteInstalledMods.ts] [useGetCompleteInstalledMods > getCompleteInstalledMods] Mods got succesfully.`)
    })

    await Promise.all(
      mods.mods.map(async (mod) => {
        const dmod = await queryMod({ modid: mod.modid })
        mod._mod = dmod

        if (dmod) {
          for (const release of dmod.releases) {
            const compatibleWithVersion = release.tags.some((tag) => tag.startsWith(`v${version.split(".").slice(0, 2).join(".")}`))
            if (compatibleWithVersion) {
              const newRelease = semver.compare(mod.version, release.modversion)
              if (newRelease === -1) {
                availableModUpdates.current++
                mod._updatableTo = release.modversion
                break
              } else {
                break
              }
            }
          }
        }
      })
    )

    window.api.utils.logMessage(
      "info",
      `[front] [mods] [features/mods/hooks/useGetCompleteInstalledMods.ts] [useGetCompleteInstalledMods > getCompleteInstalledMods] Found ${availableModUpdates.current} mod updates.`
    )

    if (onFinish) onFinish(availableModUpdates.current)
    return mods
  }

  return getCompleteInstalledMods
}
