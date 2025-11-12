#!/usr/bin/env node
import fs from 'node:fs'
import assert from 'node:assert'
import { parseArgs } from 'node:util'
import { isReadable, Readable } from 'node:stream'
import _ from 'lodash'
import fp from 'lodash/fp.js'
import { parse } from './parse.mjs'
import { transform } from './transform.mjs'
import { print } from './print.mjs'
import { format } from 'node:path'

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
    'input-format': {
      type: 'string',
      short: 'i',
    },
    'output-format': {
      type: 'string',
      short: 'o',
      default: 'raw',
    },
    'inner-format': {
      type: 'string',
      default: 'raw',
    },
    'output-options': {
      type: 'string',
    },
    indent: {
      type: 'string',
      default: '2',
    },
    take: {
      type: 'string',
    },
    as: {
      type: 'string',
    },
    to: {
      type: 'string',
    },
    delimiter: {
      type: 'string',
      short: 'd',
    },
    version: {
      type: 'boolean',
      short: 'v',
    },
  },
  allowPositionals: true,
})

if (opts.help) {
  console.log(`Usage: jsq [options] <expression> [files...]

Options:
  -h, --help               Show this help message
  -v, --version            Show version number
  -i, --input-format       Input format (json, ndjson, lines, csv, yaml) (default: auto)
  -o, --output-format      Output format (raw, json, yaml, table, inspect) (default: raw)
  --inner-format           Inner format for csv and table output (default: raw)
  --input-options          Specify input options as a JSON string (default: {})
  --output-options         Specify output options as a JSON string (default: {})
  --indent N               Indentation level for JSON output (default: 2)
  --delimiter <string>     Delimiter to use between output items (default: '\\n')
  --take N                 Take only the first N items from the input (default: all)
  --as <stream|array>      Treat input as 'stream' or 'array' (default: based on input)
  --to <stream|array>      Output as 'stream' or 'array' (default: same as input)

Expression:
  A JavaScript expression to evaluate for each input item. The input item is
  available as '$'. You can also use lodash (_) and lodash/fp (fp)
  functions. Additionally, '$$' is available as a lodash chain object of the
  input item.

Examples:
  jsq -i ndjson -o pretty '_.map($, "name")' data.ndjson
  jsq -i csv -o json 'fp.filter({ age: fp.gt(30) }, $)' < data.csv
  jsq -i yaml -o yaml '$.users[0]' < data.yaml
`)
  process.exit(0)
}

if (opts.version) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
  console.log(pkg.version)
  process.exit(0)
}

try {
  const {
    'input-format': inputFormat,
    'input-options': inputOptions,
    'output-format': outputFormat,
    'output-options': outputOptions,
    'inner-format': innerFormat,
    as,
    to,
  } = opts

  const inOptions = JSON.parse(inputOptions || '{}')
  const outOptions = {
    indent: +opts.indent,
    delim: opts.delimiter,
    format: innerFormat,
    ...JSON.parse(outputOptions || '{}'),
  }

  const [expr = '$', ...files] = positionals
  const context = { _, fp }
  const fn = new Function('self', ...Object.keys(context), transform(expr === '.' ? '$' : expr))
  const evaluate = (value) => {
    let result = fn.call(value, value, ...Object.values(context))
    if (result instanceof _) {
      return result.value()
    }
    if (typeof result === 'function') {
      return result(value)
    }
    return result
  }

  for (const file of files.length ? files : ['-']) {
    const source = file === '-' ? process.stdin : fs.createReadStream(file, 'utf-8')
    const extension = file.match(/[.]([^.]+$)/)?.[1]
    const extensionFormat = {
      json: 'json',
      jsonl: 'ndjson',
      ndjson: 'ndjson',
      txt: 'lines',
      csv: 'csv',
      yaml: 'yaml',
      yml: 'yaml',
    }[extension]

    let input = await parse(source, inputFormat ?? extensionFormat ?? 'json', inOptions)

    if (as === 'stream') {
      if (!isReadable(input)) {
        input = Readable.from(input)
      }
    } else if (as === 'array') {
      if (isReadable(input)) {
        input = await input.toArray()
      } else if (!Array.isArray(input)) {
        input = Array.from(Symbol.iterator in input ? input : Object.values(input))
      }
    }

    if (opts.take !== undefined) {
      const n = parseInt(opts.take, 10)
      assert(!isNaN(n) && n >= 0, `Invalid value for --take: ${opts.take}`)
      if (isReadable(input)) {
        input = input.take(n)
      } else if (Array.isArray(input)) {
        input = input.slice(0, n)
      } else {
        throw new Error('Cannot take items from input')
      }
    }

    let result = isReadable(input) ? input.map((item) => evaluate(item)) : evaluate(input)

    if (to === 'array') {
      result = isReadable(result)
        ? await result.toArray()
        : Array.from(Symbol.iterator in result ? result : Object.values(result))
    } else if (to === 'stream') {
      result = Readable.from(Symbol.iterator in result ? result : Object.values(result))
    }

    await print(result, outputFormat, outOptions)
  }
} catch (e) {
  if (e instanceof SyntaxError) {
    console.error(`Syntax Error: ${e.message}\n`)
    console.error(positionals[0].split('\n')[e.loc.line - 1])
    console.error('-'.repeat(e.loc.column) + '^')
  } else {
    console.error(process.env.DEBUG ? e : `Error: ${e.message}`)
  }
  process.exit(1)
}
