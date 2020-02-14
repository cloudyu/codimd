'use strict'

const fs = require('fs')
const path = require('path')
const markdownpdf = require('markdown-pdf')
const shortId = require('shortid')
const querystring = require('querystring')
const moment = require('moment')

const config = require('../config')
const logger = require('../logger')
const { Note, Revision } = require('../models')
const { errorInternalError, errorNotFound } = require('../response')

function actionPublish (req, res, note) {
  res.redirect(config.serverURL + '/s/' + (note.alias || note.shortid))
}

function actionSlide (req, res, note) {
  res.redirect(config.serverURL + '/p/' + (note.alias || note.shortid))
}

function actionDownload (req, res, note) {
  const body = note.content
  const title = Note.decodeTitle(note.title)
  const filename = encodeURIComponent(title)
  res.set({
    'Access-Control-Allow-Origin': '*', // allow CORS as API
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
    'Content-Type': 'text/markdown; charset=UTF-8',
    'Cache-Control': 'private',
    'Content-disposition': 'attachment; filename=' + filename + '.md',
    'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
  })
  res.send(body)
}

function actionInfo (req, res, note) {
  const body = note.content
  const extracted = Note.extractMeta(body)
  const markdown = extracted.markdown
  const meta = Note.parseMeta(extracted.meta)
  const createtime = note.createdAt
  const updatetime = note.lastchangeAt
  const title = Note.decodeTitle(note.title)

  const data = {
    title: meta.title || title,
    description: meta.description || (markdown ? Note.generateDescription(markdown) : null),
    viewcount: note.viewcount,
    createtime: createtime,
    updatetime: updatetime
  }

  res.set({
    'Access-Control-Allow-Origin': '*', // allow CORS as API
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
    'Cache-Control': 'private', // only cache by client
    'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
  })
  res.send(data)
}

function actionPDF (req, res, note) {
  const url = config.serverURL || 'http://' + req.get('host')
  const body = note.content
  const extracted = Note.extractMeta(body)
  let content = extracted.markdown
  const title = Note.decodeTitle(note.title)

  const highlightCssPath = path.join(config.appRootPath, '/node_modules/highlight.js/styles/github-gist.css')

  if (!fs.existsSync(config.tmpPath)) {
    fs.mkdirSync(config.tmpPath)
  }
  const pdfPath = config.tmpPath + '/' + Date.now() + '.pdf'
  content = content.replace(/\]\(\//g, '](' + url + '/')
  const markdownpdfOptions = {
    highlightCssPath: highlightCssPath
  }
  markdownpdf(markdownpdfOptions).from.string(content).to(pdfPath, function () {
    if (!fs.existsSync(pdfPath)) {
      logger.error('PDF seems to not be generated as expected. File doesn\'t exist: ' + pdfPath)
      return errorInternalError(res)
    }
    const stream = fs.createReadStream(pdfPath)
    let filename = title
    // Be careful of special characters
    filename = encodeURIComponent(filename)
    // Ideally this should strip them
    res.setHeader('Content-disposition', 'attachment; filename="' + filename + '.pdf"')
    res.setHeader('Cache-Control', 'private')
    res.setHeader('Content-Type', 'application/pdf; charset=UTF-8')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow') // prevent crawling
    stream.pipe(res)
    fs.unlinkSync(pdfPath)
  })
}

function actionGist (req, res, note) {
  const data = {
    client_id: config.github.clientID,
    redirect_uri: config.serverURL + '/auth/github/callback/' + Note.encodeNoteId(note.id) + '/gist',
    scope: 'gist',
    state: shortId.generate()
  }
  const query = querystring.stringify(data)
  res.redirect('https://github.com/login/oauth/authorize?' + query)
}

function actionRevision (req, res, note) {
  const actionId = req.params.actionId
  if (actionId) {
    const time = moment(parseInt(actionId))
    if (!time.isValid()) {
      return errorNotFound(res)
    }
    Revision.getPatchedNoteRevisionByTime(note, time, function (err, content) {
      if (err) {
        logger.error(err)
        return errorInternalError(res)
      }
      if (!content) {
        return errorNotFound(res)
      }
      res.set({
        'Access-Control-Allow-Origin': '*', // allow CORS as API
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
        'Cache-Control': 'private', // only cache by client
        'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
      })
      res.send(content)
    })
  } else {
    Revision.getNoteRevisions(note, function (err, data) {
      if (err) {
        logger.error(err)
        return errorInternalError(res)
      }
      const result = {
        revision: data
      }
      res.set({
        'Access-Control-Allow-Origin': '*', // allow CORS as API
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range',
        'Cache-Control': 'private', // only cache by client
        'X-Robots-Tag': 'noindex, nofollow' // prevent crawling
      })
      res.send(result)
    })
  }
}

exports.actionPublish = actionPublish
exports.actionSlide = actionSlide
exports.actionDownload = actionDownload
exports.actionInfo = actionInfo
exports.actionPDF = actionPDF
exports.actionGist = actionGist
exports.actionRevision = actionRevision
