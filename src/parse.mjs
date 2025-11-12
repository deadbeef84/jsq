import { json, text } from 'node:stream/consumers'
import split from 'split2'
import { parse as csvParse } from '@fast-csv/parse'
import yaml from 'js-yaml'

export function parse(input, format, opts = {}) {
  if (format === 'ndjson') {
    return input.compose(
      split((line) => {
        try {
          return JSON.parse(line)
        } catch (e) {
          console.error(`Error parsing JSON: ${e.message}`, line)
          return undefined
        }
      })
    )
  } else if (format === 'json') {
    return json(input)
  } else if (format === 'lines') {
    return input.compose(split(opts))
  } else if (format === 'csv') {
    return input.compose(csvParse({ headers: true, ...opts }))
  } else if (format === 'yaml') {
    return text(input).then((data) => yaml.load(data, opts))
  } else {
    throw new Error(`Unknown input format: ${format}`)
  }
}
