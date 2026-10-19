import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression, formatNumber } from '../src/engine.js';

function approximately(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(Math.abs(expected), 1),
    `Expected ${actual} to be approximately ${expected}`,
  );
}

function rejects(expression, message, options) {
  assert.throws(() => evaluateExpression(expression, options), (error) => {
    assert.equal(error.constructor, Error);
    assert.match(error.message, message);
    assert.ok(error.message.length <= 80, 'Errors should be concise.');
    return true;
  });
}

describe('evaluateExpression: arithmetic and syntax', () => {
  test('exports exactly the two public calculator functions', async () => {
    const engine = await import('../src/engine.js');
    assert.deepEqual(Object.keys(engine).sort(), ['evaluateExpression', 'formatNumber']);
  });

  test('accepts integers, decimals, whitespace, and scientific notation', () => {
    const cases = [
      ['0', 0], ['42', 42], ['.5', 0.5], ['2.', 2], ['0002.50', 2.5],
      ['  \t 2 +\n 3 ', 5], ['1e3', 1000], ['1E-3', 0.001],
      ['2.5e+2', 250], ['.5e2', 50], ['2.e2', 200], ['1e-999', 0],
    ];
    for (const [expression, expected] of cases) {
      assert.equal(evaluateExpression(expression), expected, expression);
    }
  });

  test('uses normal precedence and left-associative sums, products, and division', () => {
    const cases = [
      ['2+3*4', 14], ['(2+3)*4', 20], ['8/4/2', 1], ['8/4*2', 4],
      ['10-3-2', 5], ['2*(3+(4*5))', 46], ['6/2(1+2)', 9],
    ];
    for (const [expression, expected] of cases) {
      assert.equal(evaluateExpression(expression), expected, expression);
    }
  });

  test('powers associate right and bind more tightly than unary signs', () => {
    const cases = [
      ['2^3^2', 512], ['(2^3)^2', 64], ['-2^2', -4], ['(-2)^2', 4],
      ['2^-3', 0.125], ['-2^-2', -0.25], ['2^-3^2', 1 / 512],
      ['2^--2', 4], ['-2^2^3', -256], ['(-2)^3', -8], ['0^0', 1],
      ['9^.5', 3], ['2*3^2', 18],
    ];
    for (const [expression, expected] of cases) {
      assert.equal(evaluateExpression(expression), expected, expression);
    }
  });

  test('supports unary plus/minus wherever an operand is expected', () => {
    const cases = [
      ['+2', 2], ['--2', 2], ['-+-2', 2], ['2+-3', -1], ['2--3', 5],
      ['2*-3', -6], ['6/-2', -3], ['-(2+3)', -5], ['2(-3)', -6],
    ];
    for (const [expression, expected] of cases) {
      assert.equal(evaluateExpression(expression), expected, expression);
    }
  });

  test('supports constants and implicit multiplication around groups and functions', () => {
    const cases = [
      ['pi', Math.PI], ['e', Math.E], ['PI + E', Math.PI + Math.E],
      ['2pi', 2 * Math.PI], ['2(3+4)', 14], ['(2+3)(4+5)', 45],
      ['pi(2+3)', 5 * Math.PI], ['(2+3)pi', 5 * Math.PI],
      ['pi e', Math.PI * Math.E], ['pi2', 2 * Math.PI], ['(2+3)4', 20],
      ['2pi^2', 2 * Math.PI ** 2], ['2(3)^2', 18],
      ['2sqrt(9)', 6], ['sqrt(9)(2+1)', 9], ['sin(30)cos(0)', 0.5],
      ['2 (3 + 4)', 14],
    ];
    for (const [expression, expected] of cases) {
      approximately(evaluateExpression(expression), expected);
    }
  });

  test('distinguishes Euler multiplication from numeric exponent notation', () => {
    approximately(evaluateExpression('2e'), 2 * Math.E);
    approximately(evaluateExpression('2 e'), 2 * Math.E);
    approximately(evaluateExpression('2e(3)'), 6 * Math.E);
    assert.equal(evaluateExpression('2e3'), 2000);
    assert.equal(evaluateExpression('2e+3'), 2000);
    assert.equal(evaluateExpression('2e-3'), 0.002);
    approximately(evaluateExpression('2 e + 3'), 2 * Math.E + 3);
    approximately(evaluateExpression('2e+pi'), 2 * Math.E + Math.PI);
    approximately(evaluateExpression('2e-abs(3)'), 2 * Math.E - 3);
    approximately(evaluateExpression('1e--2'), Math.E + 2);
    approximately(evaluateExpression('1e++2'), Math.E + 2);
  });

  test('percent is a repeatable postfix division by 100, without contextual rules', () => {
    const cases = [
      ['50%', 0.5], ['50%%', 0.005], ['-50%', -0.5], ['(20+30)%', 0.5],
      ['200+10%', 200.1], ['200-10%', 199.9], ['200*10%', 20],
      ['200/10%', 2000], ['2^50%', Math.SQRT2], ['(2^3)%', 0.08],
      ['50%^2', 0.25], ['50%(2+2)', 2], ['abs(-50%)', 0.5],
    ];
    for (const [expression, expected] of cases) {
      approximately(evaluateExpression(expression), expected);
    }
  });

  test('keeps full precision during evaluation and canonicalizes negative zero', () => {
    assert.equal(evaluateExpression('0.1+0.2'), 0.1 + 0.2);
    assert.equal(evaluateExpression('(1/3)*3'), 1);
    assert.equal(evaluateExpression('1234567890123-1234567890122'), 1);
    for (const expression of ['-0', '-0%', '0/-2', '-(1-1)', '-1e-999']) {
      assert.equal(evaluateExpression(expression), 0, expression);
    }
  });
});

describe('evaluateExpression: functions and angle modes', () => {
  test('evaluates square root, absolute value, base-10 log, natural log, and nesting', () => {
    const cases = [
      ['sqrt(81)', 9], ['sqrt(0)', 0], ['abs(-42)', 42], ['log(1000)', 3],
      ['ln(e)', 1], ['log(1)', 0], ['ln(1)', 0],
      ['sqrt(abs(-16))+ln(e^2)', 6], ['abs(-sqrt(abs(-9)))', 3],
      ['sqrt(9+sqrt(16))', Math.sqrt(13)], ['SIN(30)', 0.5],
    ];
    for (const [expression, expected] of cases) {
      approximately(evaluateExpression(expression), expected);
    }
  });

  test('defaults to degrees and honors explicit degree mode', () => {
    for (const options of [undefined, {}, { angleMode: undefined }, { angleMode: 'deg' }]) {
      approximately(evaluateExpression('sin(30)', options), 0.5);
      approximately(evaluateExpression('cos(60)', options), 0.5);
      approximately(evaluateExpression('tan(45)', options), 1);
      approximately(evaluateExpression('sin(-30)', options), -0.5);
      approximately(evaluateExpression('sin(390)', options), 0.5);
    }
  });

  test('supports radians throughout nested expressions', () => {
    const options = { angleMode: 'rad' };
    approximately(evaluateExpression('sin(pi/6)', options), 0.5);
    approximately(evaluateExpression('cos(pi/3)', options), 0.5);
    approximately(evaluateExpression('tan(pi/4)', options), 1);
    approximately(evaluateExpression('sin(cos(0)*pi/6)', options), 0.5);
    approximately(evaluateExpression('sin(30)', options), Math.sin(30));
  });

  test('returns exact values for cardinal angles without erasing genuinely tiny inputs', () => {
    const cases = [
      ['sin(180)', undefined, 0], ['sin(270)', undefined, -1],
      ['cos(90)', undefined, 0], ['cos(-180)', undefined, -1],
      ['tan(180)', undefined, 0], ['sin(360000090)', undefined, 1],
      ['sin(pi)', { angleMode: 'rad' }, 0],
      ['cos(pi/2)', { angleMode: 'rad' }, 0],
      ['sin(-pi/2)', { angleMode: 'rad' }, -1],
    ];
    for (const [expression, options, expected] of cases) {
      assert.equal(evaluateExpression(expression, options), expected, expression);
    }
    assert.ok(evaluateExpression('sin(1e-20)') > 0);
    assert.equal(evaluateExpression('sin(1e-20)', { angleMode: 'rad' }), Math.sin(1e-20));
    assert.equal(evaluateExpression('sin(1e100)', { angleMode: 'rad' }), Math.sin(1e100));
  });

  test('rejects tangent poles in either angle mode', () => {
    for (const expression of ['tan(90)', 'tan(-90)', 'tan(270)', 'tan(450)']) {
      rejects(expression, /Tangent is undefined/);
    }
    for (const expression of ['tan(pi/2)', 'tan(-pi/2)', 'tan(3pi/2)']) {
      rejects(expression, /Tangent is undefined/, { angleMode: 'rad' });
    }
    assert.ok(Number.isFinite(evaluateExpression('tan(89.999999)')));
  });

  test('does not retain mode or mutate caller options across evaluations', () => {
    const options = Object.freeze({ angleMode: 'rad' });
    approximately(evaluateExpression('sin(pi/6)', options), 0.5);
    approximately(evaluateExpression('sin(30)'), 0.5);
    assert.deepEqual(options, { angleMode: 'rad' });
    rejects('sin(', /Complete the expression/);
    assert.equal(evaluateExpression('1+2'), 3);
  });
});

describe('evaluateExpression: invalid input and numeric boundaries', () => {
  test('rejects empty expressions and non-string input with safe Errors', () => {
    for (const expression of ['', ' ', '\n\t']) rejects(expression, /Enter an expression/);
    for (const expression of [null, undefined, 12, NaN, {}, [], true, Symbol('x')]) {
      rejects(expression, /Enter a valid expression/);
    }
  });

  test('rejects incomplete or mismatched expressions and adjacent bare numbers', () => {
    for (const expression of [
      '1+', '1-', '*2', '/2', '2*', '2/', '2^', '^2', '%2', '-', '+',
      '()', 'sqrt()', '(', ')', '(2+3', '2+3)', '((2)', '2(3))',
      '2 3', '.1 .2', '1..2', '2**3', '3//2', '1^^2', '2+)',
    ]) {
      rejects(expression, /expression|number|parenthes|operator/);
    }
  });

  test('rejects invalid numbers, unknown names, unsupported characters, and JS syntax', () => {
    for (const expression of [
      '.', '..', '.e2', '1e+', '1e-', '1e2.3',
      'sin 30', 'sin', 'sine(0)', 'pipi', 'Infinity', 'NaN', 'constructor(1)',
      '2,000', 'sqrt(1,2)', '2×3', '2÷3', 'π', '0x10', '1_000',
      'Math.sin(0)', 'globalThis.process.exit()', 'alert(1)', '1;2', '1=2',
      '[1]', '{2}', '"2"', '`2`', '/* comment */1',
    ]) {
      rejects(expression, /number|expression|operator|parenthes|Unknown|Invalid/);
    }
  });

  test('rejects division by zero, including computed zeros and negative powers of zero', () => {
    for (const expression of ['1/0', '0/0', '1/-0', '1/(2-2)', '1/0%', '0^-1', '(-0)^-2']) {
      rejects(expression, /Cannot divide by zero/);
    }
  });

  test('rejects non-real function and power domains', () => {
    rejects('sqrt(-1)', /Square root requires a non-negative number/);
    for (const expression of ['log(0)', 'log(-1)', 'ln(0)', 'ln(-e)']) {
      rejects(expression, /Logarithm requires a positive number/);
    }
    for (const expression of ['(-1)^.5', '(-8)^(1/3)']) {
      rejects(expression, /Result is not a real number/);
    }
  });

  test('rejects literal, arithmetic, and power overflow before it can propagate', () => {
    for (const expression of [
      '1e309', '9'.repeat(309), '1e308+1e308', '-1e308-1e308',
      '1e308*2', '1e308/1e-308', '10^1000', '0*(10^1000)',
    ]) {
      rejects(expression, /too large/);
    }
  });

  test('accepts finite extremes, tiny numbers, and floating-point underflow', () => {
    assert.equal(evaluateExpression('1.7976931348623157e308'), Number.MAX_VALUE);
    assert.equal(evaluateExpression('5e-324'), Number.MIN_VALUE);
    assert.equal(evaluateExpression('5e-324/2'), 0);
    assert.equal(evaluateExpression('sqrt(1e308)'), 1e154);
    assert.ok(Number.isFinite(evaluateExpression('sin(1e308)')));
    approximately(evaluateExpression('ln(5e-324)'), Math.log(Number.MIN_VALUE));
  });

  test('validates angle-mode options', () => {
    for (const options of [null, false, 1, 'rad', []]) {
      rejects('1', /Invalid calculator options/, options);
    }
    for (const angleMode of ['grads', 'DEG', '', null, 0]) {
      rejects('1', /Use degrees or radians/, { angleMode });
    }
  });
});

describe('evaluateExpression: resource bounds', () => {
  test('allows 4096 characters, rejects longer input, and handles long flat expressions', () => {
    assert.equal(evaluateExpression(`${' '.repeat(4095)}1`), 1);
    assert.equal(evaluateExpression(`1${'+0'.repeat(2047)}`), 1);
    rejects(`${' '.repeat(4096)}1`, /Expression is too long/);
    rejects(`1${'+0'.repeat(2048)}`, /Expression is too long/);
  });

  test('bounds parentheses and function nesting at 64 levels', () => {
    assert.equal(evaluateExpression(`${'('.repeat(64)}1${')'.repeat(64)}`), 1);
    rejects(`${'('.repeat(65)}1${')'.repeat(65)}`, /too deeply nested/);
    assert.equal(evaluateExpression(`${'abs('.repeat(64)}1${')'.repeat(64)}`), 1);
    rejects(`${'abs('.repeat(65)}1${')'.repeat(65)}`, /too deeply nested/);
  });

  test('also bounds unary and power recursion, including mixed constructs', () => {
    assert.equal(evaluateExpression(`${'-'.repeat(64)}1`), 1);
    rejects(`${'-'.repeat(65)}1`, /too deeply nested/);
    assert.equal(evaluateExpression(`1${'^1'.repeat(64)}`), 1);
    rejects(`1${'^1'.repeat(65)}`, /too deeply nested/);
    rejects(`${'('.repeat(32)}${'-'.repeat(33)}1${')'.repeat(32)}`, /too deeply nested/);
  });
});

describe('formatNumber', () => {
  test('uses deterministic English grouping, without unnecessary trailing zeros', () => {
    const cases = [
      [0, '0'], [-0, '0'], [12, '12'], [-12, '-12'], [12.5, '12.5'],
      [1000, '1,000'], [1234567.89, '1,234,567.89'], [-1234567.89, '-1,234,567.89'],
      [1000000.000001, '1,000,000'], [1e14, '100,000,000,000,000'],
    ];
    for (const [value, expected] of cases) assert.equal(formatNumber(value), expected);
  });

  test('limits display precision to 12 significant digits and removes common artifacts', () => {
    const cases = [
      [0.1 + 0.2, '0.3'], [0.3 - 0.2, '0.1'], [1 / 3, '0.333333333333'],
      [2 / 3, '0.666666666667'], [Math.PI, '3.14159265359'],
      [Math.E, '2.71828182846'], [1.0000000000000002, '1'],
      [1.23456789012345, '1.23456789012'], [1234567890.12345, '1,234,567,890.12'],
      [999.9999999999, '1,000'],
    ];
    for (const [value, expected] of cases) assert.equal(formatNumber(value), expected);
  });

  test('uses compact scientific notation for extremes and preserves small nonzero results', () => {
    const cases = [
      [1e-9, '0.000000001'], [1e-10, '1e-10'], [-1e-10, '-1e-10'],
      [1.23456789012345e-20, '1.23456789012e-20'],
      [1e15, '1e+15'], [-1e15, '-1e+15'], [1e21, '1e+21'],
      [1.23456789012345e100, '1.23456789012e+100'],
      [Number.MAX_VALUE, '1.79769313486e+308'],
      [-Number.MAX_VALUE, '-1.79769313486e+308'],
      [Number.MIN_VALUE, '4.94065645841e-324'],
    ];
    for (const [value, expected] of cases) assert.equal(formatNumber(value), expected);
    assert.equal(formatNumber(999999999999999), '1e+15');
    assert.equal(formatNumber(9.999999999999e-10), '0.000000001');
  });

  test('formats evaluated results without changing evaluation precision', () => {
    const value = evaluateExpression('0.1+0.2');
    assert.equal(formatNumber(value), '0.3');
    assert.equal(value, 0.30000000000000004);
    assert.equal(formatNumber(evaluateExpression('1234567+0.5')), '1,234,567.5');
    assert.equal(formatNumber(evaluateExpression('cos(90)')), '0');
  });

  test('rejects non-finite and non-number values with concise Errors', () => {
    for (const value of [NaN, Infinity, -Infinity, '1', null, undefined, {}, 1n]) {
      assert.throws(() => formatNumber(value), {
        name: 'Error',
        message: 'Cannot format a non-finite number.',
      });
    }
  });
});
