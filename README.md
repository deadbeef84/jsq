# JSQ - Command line javascript processor

JSQ is a command line processor inspired by [jq](https://jqlang.org/). It supports JSON, ND-JSON, CSV and YAML. The transformation expressions are written in JavaScript.

The motivation for creating this tool was that I found jq's language to be counter intuitive and difficult to learn, especially for more complex transformations. Since I am already familiar with JavaScript, it made sense to create a similar tool using JavaScript as the transformation language.

## Installation

```bash
npm i -g jsq-cli
```

## Usage

```bash
jsq [options...] EXPRESSION [files...]
```

Where `EXPRESSION` is a JavaScript expression that will be evaluated for each input item. The input item is available as the variable `$`.

If no files are specified, input is read from standard input.

### Options

`-h | --help`

Show help information

`-v | --version`

Show version information

`-i | --input-format FORMAT`

Specify input format. Supported formats are `json`, `jsonl` / `ndjson`, `csv`, `yaml`. If not specified, the format is inferred from the file extension, or `json` when extension is not available.

Input options can be specified using the `--input-options` flag as a JSON string.

`-o | --output-format FORMAT`

Specify output format. Supported formats are:

- `raw`: Like `json`, but strings are printed without quotes.
- `json`: JSON format.
- `yaml`: YAML format.
- `table`: Tabular format for arrays of objects.
- `inspect`: Pretty-printed format using Node.js `util.inspect`.

Output options can be specified using the `--output-options` flag as a JSON string.

`--as <stream|array>`
`--to <stream|array>`

Input is read either as a single item (for `json` and `yaml` formats) or as a stream of items (for `ndjson`, `lines` and `csv` formats). You can control this behavior using the `--as` input option. For example, to a read a CSV file as a single item (an array of objects), use `--as array`. Likewise, if you want to read a JSON array as a stream of items, use `--as stream`.

If your input is a stream of items, the output will also be a stream of items. You can change this behavior using the `--to` output option. For example, to collect all output items into an array, use `--to array`. Likewise, to output each item separately, use `--to stream`.

`--delimiter DELIM`

Specify delimiter to use after each item when outputting a stream. Default is newline (`\n`).

`--indent N`

Specify number of spaces to use for indentation when outputting JSON or YAML. Default is `2`.

`--take N`

Process only the first N input items. When input is an array, only the first N elements of the array are processed.

## Getting started

Parsing a file and printing as JSON:

```bash
jsq $ package.json

# or using self variable
jsq self package.json

# or using this variable
jsq this package.json
```

This is the identity transform, using the input `$` (or `self`) as output. The identity transform can also be written as `.`.

Root level properties of the input object can also be accessed directly:

```bash
jsq name package.json

# or using any of the variables $, self, this
jsq $.name package.json
```

To extract multiple properties, you can use object literal syntax:

```bash
jsq '({ name, version })' package.json

# or without parentheses using return statement
jsq 'return { name, version }' package.json
```

This is all regular javascript, but you can also do more complex transformations. For example, to get a list of all dependencies in `package.json` and their versions, and output as a table:

```bash
cat package.json | jsq -o table "
Object.entries(dependencies)
  .map(([name, version]) => ({ name, version }))
  .sort((a, b) => a.name.localeCompare(b.name))
"
```

This will output:

```raw
╔══════════════════╤══════════╗
║ name             │ version  ║
╟──────────────────┼──────────╢
║ @fast-csv/format │ ^5.0.5   ║
║ @fast-csv/parse  │ ^5.0.5   ║
║ acorn            │ ^8.15.0  ║
║ astring          │ ^1.9.0   ║
║ js-yaml          │ ^4.1.0   ║
║ json-colorizer   │ ^3.0.1   ║
║ lodash           │ ^4.17.21 ║
║ split2           │ ^4.2.0   ║
║ table            │ ^6.9.0   ║
╚══════════════════╧══════════╝
```

### Different input and output formats

You can specify different input and output formats using the `-i` and `-o` options. For example, to convert JSON to YAML:

```bash
jsq $ package.json -o yaml
```

Or if you have a CSV file and want to convert it to ND-JSON:

```bash
curl -sSL https://github.com/MainakRepositor/Datasets/raw/refs/heads/master/books.csv | jsq $ -i csv -o json --indent 0
```

The `--indent 0` makes sure that the output JSON is compact (no extra spaces or newlines), which is the standard format for ND-JSON.

N.B, for CSV input the first line is assumed to be the header row. Then each row is parsed as an object with properties corresponding to the header names.



Another example is reading a json array and outputting as a table:

```bash
curl -s 'https://api.github.com/repos/deadbeef84/jsq/commits?per_page=5' |
  jsq --as stream "({ name: commit.committer.name, message: commit.message })" -o table
```

The `--as stream` makes sure that each element of the input array is processed separately.

### Lodash and lodash/fp

Lodash and lodash/fp are available as `_` and `fp` respectively. Additionally, `$$` is available as an explicit chain object of the input, i.e. `_.chain($)`, which will be automatically unwrapped when returned from the expression.

```bash
jsq '$$.mapValues(v => typeof v)' package.json
```

You can also use lodash/fp for a more functional programming style:

```bash
jsq 'fp.pick(["name", "version"])' package.json
```

Note that if a function is returned, it will be called with the input as the first argument. This makes it easy to use lodash/fp functions that expect the data as the last argument.

### Compared to jq

For comparison, here is how you would get the last 5 commit messages from the jq repository using `jq` (from their tutorial):

```bash
curl 'https://api.github.com/repos/jqlang/jq/commits?per_page=5' |
  jq '[.[] | {message: .commit.message, name: .commit.committer.name, parents: [.parents[].html_url]}]'
```

And here is how you would do the same using `jsq`:

```bash
curl 'https://api.github.com/repos/jqlang/jq§/commits?per_page=5' |
  jsq "$.map(x => ({ message: x.commit.message, name: x.commit.committer.name, parents: x.parents.map(p => p.html_url) }))"
```
