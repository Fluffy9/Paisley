const mockPage = {
  goto() {
    return Promise.resolve()
  },

  $$() {
    return Promise.resolve([])
  },

  $() {
    return Promise.resolve()
  },

  $eval() {
    return Promise.resolve()
  },

  on() {
    return true
  },

  setOfflineMode(value) {
    return value
  },

  setDefaultNavigationTimeout(timeout) {
    // Mock method for setting navigation timeout
    return timeout
  },

  setDefaultTimeout(timeout) {
    // Mock method for setting default timeout
    return timeout
  }
}

const mockBrowser = {
  newPage() {
    return Promise.resolve(mockPage)
  },

  close() {
    return Promise.resolve()
  }
}

const mockPuppeteer = {
  launch() {
    return Promise.resolve(mockBrowser)
  }
}

const mockElementHandle = {
  $eval() {
    return Promise.resolve()
  }
}

module.exports = { mockPage, mockBrowser, mockPuppeteer, mockElementHandle }
