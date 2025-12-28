const rimraf = require('rimraf')
const MailHandler = require('../classes/MailHandler')
const DataHandler = require('../classes/DataHandler')
const { mkdirSync, readdirSync } = require('fs')

const dataDir = './tests/test-data'
// set the mail data dir our temp dir
process.env.MAIL_DATA_DIR = dataDir
process.env.HOST = 'somehost'
process.env.PORT = 2525
process.env.LOGIN = 'jane'
process.env.PASSWORD = 'james'
process.env.FROM_EMAIL = 'janedoe@mail.com'
process.env.MAIL_DATA_DIR = dataDir
process.env.VIEWS_DIR = './email-templates'
const email = 'janedoe@gmail.com'

jest.mock('nodemailer', () => ({
  createTransport(obj) {
    // check the object before return
    return { sendMail: this.sendMail }
  },
  sendMail(options, cb) {
    cb(null, { response: 'Ok', accepted: [email] })
  }
}))
let mH
const mailData = {
  0: {
    posts: Array.from({ length: 6 }).map((p, i) => {
      const points = (546 - i) % (i + 60)
      return {
        link: 'link-to-title',
        title: 'some fancy title',
        // generate a number between 100 and 1
        points,
        comments: i,
        commentLink: 'link-to-comment',
        domain: 'some fancy domain'
      }
    }),
    config: {
      website: 'link-to-some-fancy-website',
      post: '.Post',
      ignore:
        '^(ascending|outsideContext|ignore|count|name|channel|post|website)$',
      name: 'r/unixporn',
      count: 6,
      link: 'link-to-th-fancy-link',
      sort: 'points'
    }
  },
  name: 'Daily Digest',
  cron: '* 1 * * *'
}

const mailData2 = {
  0: {
    posts: Array.from({ length: 6 }).map((p, i) => {
      const rank = (546 - i) % (i + 60)
      return {
        link: 'link-to-title',
        rank,
        artist: 'Lil Baby',
        isNew: 'New',
        'last-week': i
      }
    }),

    config: {
      structure: {
        top: {
          name: 'Top Songs',
          sort: 'rank',
          ascending: true,
          count: 6
        },

        'most-gains': {
          name: 'Most Gains',
          ascending: false,
          sort: ['last-week', '-', 'rank'],
          count: 6
        }
      }
    }
  },
  name: 'Daily Digest',
  cron: '* 1 * * *'
}

const mailName1 = `${email}-mail-0.yaml`
const mailName2 = `${email}-mail-1.yaml`
const mailPath1 = `${dataDir}/${mailName1}`
const mailPath2 = `${dataDir}/${mailName2}`

beforeAll(async () => {
  // create the data yaml file here
  try {
    mkdirSync(dataDir)
  } catch (e) {}
  await DataHandler.write(mailPath1, mailData)
  await DataHandler.write(mailPath2, mailData2)
})

afterAll((cb) => rimraf(dataDir, cb))

beforeEach((cb) => {
  // create a fresh new object every time we run a test
  mh = MailHandler.init()
  mh.quiet = false
  cb()
})

test('if formMailData is working well', async () => {
  // creat the yaml file
  const { data, email } = await mh.formMailData(mailPath1)
  testDate(data.date)
  testMails(data.mails)
  expect(data.name).toEqual(expect.stringMatching(/\w+/))
})

test('if init is working as expected', () => {
  expect(MailHandler.init()).toEqual(expect.any(MailHandler))
})

test('if convertMailDataToArray is working as expected', async () => {
  const data = mh.convertMailDataToArray(await DataHandler.read(mailPath1))
  testMails(data.mails)
  expect(data.name).toEqual(expect.stringMatching(/\w+/))
})

test('if start is working as expected', async () => {
  const dataDirContent = readdirSync(dataDir)
  const count = await mh.start()
  expect(count).toBe(dataDirContent.length)
})

test('if sendMail is working as expected', async () => {
  const response = await mh.sendMail(
    email,
    '<h1>hello world</h1>',
    'testing email'
  )
  expect(response).toEqual(
    expect.objectContaining({
      accepted: expect.arrayContaining([email]),
      response: expect.stringMatching(/Ok/)
    })
  )
})

test('if formDate is working as expected', () => {
  const date = mh.formDate()
  testDate(date)
})

describe('transformPosts is working as expected', () => {
  test('on mail without .structure', async () => {
    let data = mh.convertMailDataToArray(await DataHandler.read(mailPath1))
    data = mh.transformPosts(data)
    testMails(data.mails)
    expect(data.name).toEqual(expect.stringMatching(/\w+/))
  })

  test('on mail with .structure', async () => {
    let data = mh.convertMailDataToArray(await DataHandler.read(mailPath2))
    data = mh.transformPosts(data)
    data.mails.forEach((m) => {
      expect(m.sections).toEqual(expect.any(Array))
      testMails(m.sections)
    })
    expect(data.name).toEqual(expect.stringMatching(/\w+/))
  })
})

describe('sortAndSlicePost is working as expected', () => {
  test('on mail without .structure', async () => {
    let data = mh.convertMailDataToArray(await DataHandler.read(mailPath1))
    data = mh.transformPosts(data)
    data.mails.forEach((posts) => {
      const count = 4
      posts.config.count = count
      posts = mh.sortAndSlicePost(posts)
      expect(posts.posts.length).toBe(count)
      expect(isPostsSorted(posts)).toBe(true)
    })
  })

  test('on mail with .structure', async () => {
    let data = mh.convertMailDataToArray(await DataHandler.read(mailPath2))
    data = mh.transformPosts(data)
    data.mails[0].sections.forEach((posts) => {
      const count = 4
      posts.config.count = count
      posts = mh.sortAndSlicePost(posts)
      expect(posts.posts.length).toBe(count)
      expect(isPostsSorted(posts)).toBe(true)
    })
  })

  function isPostsSorted(data) {
    let allSorted = true
    const sort = data.config.sort

    // Safe evaluation function (matches MailHandler implementation)
    function safeEvaluate(operand1, operator, operand2) {
      const allowedOperators = ['+', '-', '*', '/']
      if (!allowedOperators.includes(operator)) {
        return 0
      }
      const num1 = Number(operand1) || 0
      const num2 = Number(operand2) || 0
      switch (operator) {
        case '+':
          return num1 + num2
        case '-':
          return num1 - num2
        case '*':
          return num1 * num2
        case '/':
          return num2 !== 0 ? num1 / num2 : 0
        default:
          return 0
      }
    }

    function fetchProp(data, prop) {
      let result = 0
      if (typeof prop === 'string' && data[prop]) result = data[prop]
      return !Number(result) ? 0 : Number(result)
    }

    data.posts.sort((a, b) => {
      let valA, valB
      if (Array.isArray(sort) && sort.length === 3) {
        const [fo, op, so] = sort
        // Use safe evaluation instead of eval()
        valA = safeEvaluate(fetchProp(a, fo), op, fetchProp(a, so))
        valB = safeEvaluate(fetchProp(b, fo), op, fetchProp(b, so))
      } else if (typeof sort === 'string') {
        valA = fetchProp(a, sort)
        valB = fetchProp(b, sort)
      } else {
        valA = 0
        valB = 0
      }

      // for some reason js gives a > b in ascending
      // maybe they want you to verify that you want the same thing
      if (data.config.ascending && valA <= valB) {
        allSorted = false
      } else if (!data.config.ascending && valA >= valB) {
        allSorted = false
      }

      allSorted = !!valA && !!valB ? allSorted : false
      return true
    })
    return allSorted
  }
})

test('if constructMailData is working as expected', async () => {
  const { name, email, mail } = await mh.constructMailData(mailPath1)
  expect(email).toBe(email)
  expect(name).toBe(name)
  mailData['0'].posts.forEach((post) => {
    for (let key in post) {
      expect(mail).toEqual(expect.stringMatching(new RegExp(post[key])))
    }
  })
  expect(1).toBe(1)
})

function testDate(date) {
  expect(date).toEqual(
    expect.objectContaining({
      date: expect.stringMatching(/\d{1,2}/),
      month: expect.stringMatching(/\w+/),
      weekDay: expect.stringMatching(/\w+/),
      year: expect.stringMatching(/\d{4}/)
    })
  )
}

function testMails(mails) {
  expect(mails).toEqual(
    expect.arrayContaining([
      {
        posts: expect.any(Array),
        config: expect.any(Object)
      }
    ])
  )
}
