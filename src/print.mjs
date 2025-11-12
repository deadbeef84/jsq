import assert from 'node:assert'
import util from 'node:util'
import { isReadable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { text } from 'node:stream/consumers'
import yaml from 'js-yaml'
import { colorize } from 'json-colorizer'
import { table } from 'table'
import { format as csvFormat } from '@fast-csv/format'

const drawHorizontalLine = (idx, count) => idx <= 1 || idx === count
const transformRow = (opts) => (row, cb) => {
  Promise.all(
    Object.entries(row).map(async ([k, v]) => [k, await render(v, opts.format ?? 'raw', opts)])
  ).then(
    (r) => cb(null, Object.fromEntries(r)),
    (err) => cb(err)
  )
}

export async function render(value, format, opts = {}) {
  if (value === undefined) {
    return
  }

  if (format === 'inspect') {
    return util.inspect(value, { colors: true, depth: null, numericSeparator: true, ...opts })
  } else if (format === 'raw') {
    if (typeof value === 'string') {
      return value
    } else {
      return colorize(value, opts)
    }
  } else if (format === 'json') {
    return colorize(JSON.stringify(value), opts)
  } else if (format === 'yaml' || format === 'yml') {
    return yaml.dump(value, opts).trimEnd()
  } else if (format === 'csv') {
    if (!value || typeof value !== 'object') {
      return render(value, 'raw', opts)
    }
    const rows =
      value?.[Symbol.iterator] || value?.[Symbol.asyncIterator]
        ? value
        : Object.entries(value).map(([key, value]) => ({ key, value }))
    return await pipeline(
      rows,
      csvFormat({
        headers: true,
        ...opts,
        transform: transformRow(opts),
      }),
      text
    )
  } else if (format === 'table') {
    if (
      !value ||
      typeof value !== 'object' ||
      (Array.isArray(value) && typeof value[0] !== 'object')
    ) {
      if (Array.isArray(value)) {
        value = value.join(', ')
      }
      return render(value, 'raw', opts)
    }

    const rows = Array.isArray(value)
      ? value
      : Object.entries(value).map(([key, value]) => ({ key, value }))

    if (!rows.length) {
      return
    }

    if (typeof rows[0] !== 'object' || rows[0] === null) {
      throw new Error(`Table format requires an array of objects ${JSON.stringify(rows)}`)
    }

    const columns = Object.keys(rows[0])

    const data = [columns]
    for (const row of rows) {
      data.push(
        await Promise.all(columns.map((col) => render(row[col], opts.format ?? 'raw', opts)))
      )
    }

    const multiline = data.some((row) => row.some((value) => value?.includes('\n')))

    return table(data, multiline ? {} : { drawHorizontalLine }).trimEnd()
  } else {
    throw new Error(`Unknown output format: ${format}`)
  }
}

export async function print(value, format, { delim = '\n', ...opts } = {}) {
  if (format === 'table') {
    console.log(
      await render(value?.[Symbol.asyncIterator] ? await value.toArray() : value, format, opts)
    )
  } else if (format === 'csv') {
    const rows =
      value?.[Symbol.iterator] || value?.[Symbol.asyncIterator]
        ? value
        : Object.entries(value).map(([key, value]) => ({ key, value }))
    await pipeline(
      rows,
      csvFormat({
        headers: true,
        transform: transformRow(opts),
      }),
      process.stdout
    )
  } else {
    if (isReadable(value)) {
      await value.forEach(async (item) =>
        process.stdout.write((await render(item, format, opts)) + delim)
      )
    } else {
      console.log(await render(value, format, opts))
    }
  }
}
