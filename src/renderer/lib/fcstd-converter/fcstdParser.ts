import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import type { FreeCadDocument, FreeCadObject, PropertyValue } from './fcstdTypes'

const SUPPORTED_PREFIXES = ['Part::', 'PartDesign::']

function isSupportedType(type: string): boolean {
  if (!SUPPORTED_PREFIXES.some(p => type.startsWith(p))) return false
  if (type.includes('Part2D')) return false
  return true
}

function getChildAttr(parent: Element, tag: string, attr: string): string | null {
  const els = parent.getElementsByTagName(tag)
  if (els.length === 0) return null
  return els[0].getAttribute(attr)
}

function parseProperties(parent: Element | null): Record<string, PropertyValue> | null {
  if (!parent) return null
  const props: Record<string, PropertyValue> = {}
  const propElements = parent.getElementsByTagName('Property')
  for (let i = 0; i < propElements.length; i++) {
    const el = propElements[i]
    const name = el.getAttribute('name')
    const type = el.getAttribute('type')
    if (!name || !type) continue
    switch (type) {
      case 'App::PropertyBool': {
        const v = getChildAttr(el, 'String', 'bool')
        if (v !== null) props[name] = { type: 'bool', value: v === 'true' }
        break
      }
      case 'App::PropertyInteger': {
        const v = getChildAttr(el, 'Integer', 'value')
        if (v !== null) props[name] = { type: 'int', value: parseInt(v, 10) }
        break
      }
      case 'App::PropertyFloat':
      case 'App::PropertyLength':
      case 'App::PropertyDistance':
      case 'App::PropertyArea':
      case 'App::PropertyVolume': {
        const v = getChildAttr(el, 'Float', 'value')
        if (v !== null) props[name] = { type: 'float', value: parseFloat(v) }
        break
      }
      case 'App::PropertyString': {
        const v = getChildAttr(el, 'String', 'value')
        if (v !== null) props[name] = { type: 'string', value: v }
        break
      }
      case 'App::PropertyUUID': {
        const v = getChildAttr(el, 'Uuid', 'value')
        if (v !== null) props[name] = { type: 'uuid', value: v }
        break
      }
    }
  }
  return Object.keys(props).length > 0 ? props : null
}

function getDomParser(): { parseFromString(text: string, mime: string): Document } {
  try {
    return new DOMParser()
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DOMParser: XmldomParser } = require('@xmldom/xmldom') as typeof import('@xmldom/xmldom')
    return new XmldomParser()
  }
}

function parseXmlContent(content: Uint8Array): Document {
  const text = new TextDecoder().decode(content)
  const parser = getDomParser()
  return parser.parseFromString(text, 'text/xml') as unknown as Document
}

export function parseFcstd(buffer: ArrayBuffer): FreeCadDocument {
  const files = unzipSync(new Uint8Array(buffer))
  const doc: FreeCadDocument = { files, objects: [], properties: null }

  if (!files['Document.xml']) {
    throw new Error('No Document.xml found in FCStd archive')
  }
  const docXml = parseXmlContent(files['Document.xml'])

  const objectMap = new Map<string, FreeCadObject>()

  const objectElements = docXml.getElementsByTagName('Object')
  for (let i = 0; i < objectElements.length; i++) {
    const el = objectElements[i]
    const name = el.getAttribute('name')
    const type = el.getAttribute('type')
    if (!name || !type || !isSupportedType(type)) continue
    const obj: FreeCadObject = {
      name, type, label: null,
      isVisible: true, color: null,
      inLinkCount: 0,
      brepFileName: null, brepContent: null,
      properties: null,
    }
    objectMap.set(name, obj)
  }

  const objectDataElements = docXml.getElementsByTagName('ObjectData')
  for (let i = 0; i < objectDataElements.length; i++) {
    const objectDataEl = objectDataElements[i]
    const objElements = objectDataEl.getElementsByTagName('Object')
    for (let j = 0; j < objElements.length; j++) {
      const objEl = objElements[j]
      const name = objEl.getAttribute('name')
      if (!name || !objectMap.has(name)) continue
      const obj = objectMap.get(name)!

      const propElements = objEl.getElementsByTagName('Property')
      for (let k = 0; k < propElements.length; k++) {
        const propEl = propElements[k]
        const propName = propEl.getAttribute('name')
        switch (propName) {
          case 'Label':
            obj.label = getChildAttr(propEl, 'String', 'value')
            break
          case 'Visibility':
          case 'Visible':
            obj.isVisible = getChildAttr(propEl, 'Bool', 'value') === 'true'
            break
          case 'Shape': {
            const fileName = getChildAttr(propEl, 'Part', 'file')
            if (!fileName || !files[fileName]) break
            const ext = fileName.split('.').pop()?.toLowerCase()
            if (ext !== 'brp' && ext !== 'brep') break
            obj.brepFileName = fileName
            obj.brepContent = files[fileName]
            break
          }
        }
      }

      const linkElements = objEl.getElementsByTagName('Link')
      for (let k = 0; k < linkElements.length; k++) {
        const linkedName = linkElements[k].getAttribute('value')
        if (linkedName && objectMap.has(linkedName)) {
          objectMap.get(linkedName)!.inLinkCount++
        }
      }

      obj.properties = parseProperties(objEl)
    }
  }

  if (files['GuiDocument.xml']) {
    const guiXml = parseXmlContent(files['GuiDocument.xml'])
    const vpElements = guiXml.getElementsByTagName('ViewProvider')
    for (let i = 0; i < vpElements.length; i++) {
      const vpEl = vpElements[i]
      const name = vpEl.getAttribute('name')
      if (!name || !objectMap.has(name)) continue
      const obj = objectMap.get(name)!
      const propElements = vpEl.getElementsByTagName('Property')
      for (let j = 0; j < propElements.length; j++) {
        const propEl = propElements[j]
        const propName = propEl.getAttribute('name')
        if (propName === 'Visibility') {
          obj.isVisible = getChildAttr(propEl, 'Bool', 'value') === 'true'
        } else if (propName === 'ShapeColor') {
          const colorStr = getChildAttr(propEl, 'PropertyColor', 'value')
          if (colorStr) {
            const rgba = parseInt(colorStr, 10)
            obj.color = [
              (rgba >> 24) & 0xff,
              (rgba >> 16) & 0xff,
              (rgba >> 8) & 0xff,
              255,
            ]
          }
        }
      }
    }
  }

  const docPropEls = docXml.getElementsByTagName('Document')
  if (docPropEls.length > 0) {
    const docEl = docPropEls[0]
    const propGroupEls = docEl.getElementsByTagName('Properties')
    if (propGroupEls.length > 0) {
      doc.properties = parseProperties(propGroupEls[0])
    }
  }

  doc.objects = Array.from(objectMap.values())
  return doc
}
