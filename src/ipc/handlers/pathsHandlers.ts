import { ipcMain, app, shell } from "electron"
import fse from "fs-extra"
import { join, sep } from "path"
import os from "os"
import { spawn } from "child_process"
import { Worker } from "worker_threads"

import { logMessage } from "@src/utils/logManager"
import { IPC_CHANNELS } from "@src/ipc/ipcChannels"

import compressWorker from "@src/ipc/workers/compressWorker?modulePath"
import extractWorker from "@src/ipc/workers/extractWorker?modulePath"
import changePermsWorker from "@src/ipc/workers/changePermsWorker?modulePath"
import downloadWorkerPath from "@src/ipc/workers/downloadWorker?modulePath"

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.GET_CURRENT_USER_DATA_PATH, (): string => {
  return app.getPath("appData")
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.DELETE_PATH, (_event, path: string): boolean => {
  try {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DELETE_PATH] Deleting path ${path}`)
    fse.removeSync(path)
    return true
  } catch (err) {
    logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DELETE_PATH] Error deleting path ${path}.`)
    logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DELETE_PATH] Error deleting path ${path}: ${err}`)
    return false
  }
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.FORMAT_PATH, (_event, parts: string[]): string => {
  return join(...parts)
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.REMOVE_FILE_FROM_PATH, (_event, path: string): string => {
  return path.split(sep).slice(0, -1).join(sep)
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.CHECK_PATH_EMPTY, (_event, path: string): boolean => {
  if (!fse.existsSync(path)) return true
  return fse.statSync(path).isDirectory() && fse.readdirSync(path).length === 0
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.CHECK_PATH_EXISTS, (_event, path: string): boolean => {
  return fse.existsSync(path)
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.ENSURE_PATH_EXISTS, (_event, path: string): boolean => {
  try {
    fse.ensureDirSync(path)
  } catch (err) {
    logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [ENSURE_PATH_EXISTS] Error ensuring path ${path}.`)
    logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [ENSURE_PATH_EXISTS] Error ensuring path ${path}: ${err}`)
    return false
  }
  return true
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.OPEN_PATH_ON_FILE_EXPLORER, async (_event, path: string): Promise<string> => {
  return await shell.openPath(path)
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.DOWNLOAD_ON_PATH, (event, id: string, url: string, outputPath: string, fileName: string) => {
  return new Promise((resolve, reject) => {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Downloading ${url} on ${outputPath} on file ${fileName}.`)

    const worker = new Worker(downloadWorkerPath, {
      workerData: { id, url, outputPath, fileName }
    })

    worker.on("message", (message) => {
      if (message.type === "progress") {
        event.sender.send(IPC_CHANNELS.PATHS_MANAGER.DOWNLOAD_PROGRESS, id, message.progress)
      } else if (message.type === "finished") {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Download finished.`)
        resolve(message.path)
      } else {
        logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Error downloading.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Error downloading: ${JSON.stringify(message.error)}`)
      }
    })

    worker.on("error", (err) => {
      logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Worker error.`)
      logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Worker error: ${JSON.stringify(err.message)}`)
      reject(false)
    })

    worker.on("exit", (code) => {
      if (code !== 0) {
        logMessage("warn", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Worker exited with errors.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [DOWNLOAD_ON_PATH] [${id}] [${fileName}] Worker exited with errors. Code ${code}`)
        reject(new Error(`Worker stopped with exit code ${code}`))
      }
    })
  })
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.EXTRACT_ON_PATH, async (event, id: string, filePath: string, outputPath: string, deleteZip: boolean) => {
  return new Promise((resolve, reject) => {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Extracting to ${outputPath}.`)

    const worker = new Worker(extractWorker, {
      workerData: { filePath, outputPath, deleteZip }
    })

    worker.on("message", (message) => {
      if (message.type === "progress") {
        event.sender.send(IPC_CHANNELS.PATHS_MANAGER.EXTRACT_PROGRESS, id, message.progress)
      } else if (message.type === "finished") {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Extraction finished.`)
        resolve(true)
      } else {
        logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Error extracting.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Error extracting: ${JSON.stringify(message.error)}`)
      }
    })

    worker.on("error", (err) => {
      logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Worker error.`)
      logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Worker error: ${JSON.stringify(err.message)}`)
      reject(false)
    })

    worker.on("exit", (code) => {
      if (code !== 0) {
        logMessage("warn", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Worker exited with errors.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [EXTRACT_ON_PATH] [${id}] [${filePath}] Worker exited with errors. Code ${code}`)
        reject(new Error(`Worker stopped with exit code ${code}`))
      }
    })
  })
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.COMPRESS_ON_PATH, async (event, id: string, inputPath: string, outputPath: string, outputFileName: string) => {
  return new Promise((resolve, reject) => {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Compressing ${inputPath} to ${outputPath} on file ${outputFileName}.`)

    const worker = new Worker(compressWorker, {
      workerData: { inputPath, outputPath, outputFileName }
    })

    worker.on("message", (message) => {
      if (message.type === "progress") {
        event.sender.send(IPC_CHANNELS.PATHS_MANAGER.COMPRESS_PROGRESS, id, message.progress)
      } else if (message.type === "finished") {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Compression finished.`)
        resolve(true)
      } else {
        logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Error compressing.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Error compressing: ${JSON.stringify(message.error)}`)
      }
    })

    worker.on("error", (err) => {
      logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Worker error.`)
      logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Worker error: ${JSON.stringify(err.message)}`)
      reject(false)
    })

    worker.on("exit", (code) => {
      if (code !== 0) {
        logMessage("warn", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Worker exited with errors.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [COMPRESS_ON_PATH] [${id}] [${outputFileName}] Worker exited with errors. Code ${code}`)
        reject(new Error(`Worker stopped with exit code ${code}`))
      }
    })
  })
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.CHANGE_PERMS, async (_event, paths: string[], perms: number) => {
  if (os.platform() === "linux") {
    return new Promise((resolve, reject) => {
      logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [CHANGE_PERMS] Changing perms to ${paths.length} paths.`)

      const worker = new Worker(changePermsWorker, {
        workerData: { paths, perms }
      })

      worker.on("message", (message) => {
        if (message === "done") {
          logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [CHANGE_PERMS] Perms succesfully changed to ${paths.length} paths.`)
          resolve(true)
        }
      })

      worker.on("error", (err) => {
        logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [CHANGE_PERMS] Worker error.`)
        logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [CHANGE_PERMS] Worker error: ${JSON.stringify(err.message)}`)
        reject(false)
      })

      worker.on("exit", (code) => {
        if (code !== 0) {
          logMessage("warn", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [CHANGE_PERMS] Worker exited with errors.`)
          logMessage("debug", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [CHANGE_PERMS] Worker exited with errors. Code ${code}`)
          reject(new Error(`Worker stopped with exit code ${code}`))
        }
      })
    })
  }

  return Promise.reject(true)
})

ipcMain.handle(IPC_CHANNELS.PATHS_MANAGER.LOOK_FOR_A_GAME_VERSION, async (_event, path: string) => {
  logMessage("info", `[component] [look-for-a-game-version] Looking for the game at ${path}`)

  let command: string
  let params: string[]

  const res: { exists: boolean; installedGameVersion: string | undefined } = { exists: false, installedGameVersion: undefined }

  if (os.platform() === "linux") {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Linux platform detected.`)

    try {
      const files = fse.readdirSync(path)

      if (files.includes("Vintagestory")) {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Vintagestory found.`)
        command = join(path, "Vintagestory")
        params = [`-v`]
      } else if (files.includes("Vintagestory.exe")) {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Vintagestory.exe found.`)
        command = "mono"
        params = [join(path, "Vintagestory.exe"), `-v`]
      } else {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Couldn't find Vintage Story on that folder.`)
        return false
      }
    } catch (err) {
      logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Error looking for Vintage Story.`)
      logMessage("verbose", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Error looking for Vintage Story: ${err}`)
      return false
    }
  } else if (os.platform() === "win32") {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Windows platform detected.`)

    try {
      const files = fse.readdirSync(path)

      if (files.includes("Vintagestory")) {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Vintagestory found.`)
        command = join(path, "Vintagestory.exe")
        params = [`-v`]
      } else {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Couldn't find Vintage Story on that folder.`)
        return false
      }
    } catch (err) {
      logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Error looking for Vintage Story.`)
      logMessage("verbose", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Error looking for Vintage Story: ${err}`)
      return false
    }
  } else if (os.platform() === "darwin") {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] MacOS platform detected. Not yet supported.`)
    return false
  } else {
    logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Not platform detected.`)
    return false
  }

  if (command && params) {
    const checkGameVersion = await new Promise<string | undefined>((resolve, reject) => {
      logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Checking Vintage Story version with ${command} + ${params.join(" + ")}.`)

      const externalApp = spawn(command, params)
      let versionResult: string

      externalApp.stdout.on("data", (data) => {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] ${data}`)
        versionResult = data.toString().trim()
        resolve(versionResult)
      })

      externalApp.stderr.on("data", (data) => {
        logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Vintage Story threw an error! Check verbose logs for more info.`)
        logMessage("verbose", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] ${data}`)
      })

      externalApp.on("close", (code) => {
        logMessage("info", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Vintage Story closed: ${code}`)
        resolve(versionResult)
      })

      externalApp.on("error", (error) => {
        logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] Error looking for the Vintage Story version.`)
        logMessage("verbose", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] ${error}`)
        reject(undefined)
      })
    })

    res.exists = true
    res.installedGameVersion = checkGameVersion
    return res
  } else {
    logMessage("error", `[back] [ipc] [ipc/handlers/pathsHandlers.ts] [LOOK_FOR_A_GAME_VERSION] No command or params found.`)
    return res
  }
})
