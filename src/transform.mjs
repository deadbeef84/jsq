import { parse } from 'acorn'
import { generate } from 'astring'

export function transform(code) {
  const ast = parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true })

  const { body } = ast

  if (body.length > 0) {
    const lastStatement = body[body.length - 1]

    if (lastStatement.type !== 'ReturnStatement') {
      body[body.length - 1] = {
        type: 'ReturnStatement',
        argument:
          lastStatement.type === 'ExpressionStatement' ? lastStatement.expression : lastStatement,
      }
    }
  }

  return `const $ = self, $$ = _.chain(self); with ($) { ${generate(ast)} }`
}
