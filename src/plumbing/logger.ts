import info from '../../package.json' with { type: 'json' }

const { name, version } = info

export const log = (
  message: string | { message: string; [key: string]: string | object },
) => {
  let logMessage: {
    message: string
    app: string
    version: string
    [key: string]: string | object
  }
  if (typeof message === 'string') {
    logMessage = {
      message,
      app: name,
      version,
    }
  } else {
    logMessage = {
      ...message,
      app: name,
      version,
    }
  }
  console.log(logMessage)
}
