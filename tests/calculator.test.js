import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator } from '../src/calculator.js';

const enter = (calculator, ...values) => values.forEach(value => calculator.input(value));

test('keypad input shows a live result and commits the calculation', () => {
  const calculator = new Calculator();
  enter(calculator, '1', '2', '*', '3');
  assert.equal(calculator.preview, 36);
  const entry = calculator.calculate();
  assert.equal(entry.result, 36);
  assert.equal(entry.expression, '12*3');
  assert.equal(entry.angleMode, 'deg');
  assert.ok(Number.isFinite(entry.timestamp));
  assert.equal(calculator.calculate(), null, 'repeat equals does not duplicate history');
});

test('typing a new number after equals starts fresh; operators chain full precision', () => {
  const calculator = new Calculator();
  calculator.setExpression('1/3');
  calculator.calculate();
  enter(calculator, '*', '3');
  assert.equal(calculator.calculate().result, 1);
  calculator.input('9');
  assert.equal(calculator.expression, '9');
});

test('decimal points and leading zeroes are handled on the keypad', () => {
  const calculator = new Calculator();
  enter(calculator, '0', '0', '1', '.', '.', '5');
  assert.equal(calculator.expression, '1.5');
  assert.equal(calculator.preview, 1.5);
  calculator.clear();
  enter(calculator, '.', '5');
  assert.equal(calculator.expression, '0.5');
});

test('operator replacement and negative operands work', () => {
  const calculator = new Calculator();
  enter(calculator, '8', '+', '*', '-', '2');
  assert.equal(calculator.expression, '8*-2');
  assert.equal(calculator.calculate().result, -16);
});

test('sign toggles the last operand, not the entire expression', () => {
  const calculator = new Calculator();
  calculator.setExpression('5+2');
  calculator.toggleSign();
  assert.equal(calculator.preview, 3);
  calculator.toggleSign();
  assert.equal(calculator.preview, 7);
  calculator.setExpression('5+sqrt(4)');
  calculator.toggleSign();
  assert.equal(calculator.preview, 3);
});

test('scientific functions auto-complete closing parentheses', () => {
  const calculator = new Calculator();
  enter(calculator, 'sqrt(', '9');
  assert.equal(calculator.preview, 3);
  assert.equal(calculator.calculate().expression, 'sqrt(9)');
});

test('percent applies to its operand and can be followed by multiplication', () => {
  const calculator = new Calculator();
  enter(calculator, '2', '0', '0', '*', '1', '0', '%');
  assert.equal(calculator.calculate().result, 20);
  calculator.clear();
  enter(calculator, '5', '0', '%', '2');
  assert.equal(calculator.preview, 1);
});

test('backspace works on the result and deletes function tokens', () => {
  const calculator = new Calculator();
  calculator.setExpression('12*10');
  calculator.calculate();
  calculator.backspace();
  assert.equal(calculator.expression, '12');
  calculator.clear();
  calculator.input('sin(');
  calculator.backspace();
  assert.equal(calculator.expression, '');
});

test('errors are safe and clearing fully recovers', () => {
  const calculator = new Calculator();
  calculator.setExpression('1/0');
  assert.equal(calculator.calculate(), null);
  assert.match(calculator.error, /zero/);
  calculator.clear();
  assert.equal(calculator.error, null);
  assert.equal(calculator.preview, 0);
  assert.equal(calculator.calculate(), null);
});

test('paste normalizes mathematical symbols and thousands separators', () => {
  const calculator = new Calculator();
  calculator.setExpression('1,000 × 2 − 500 ÷ 2');
  assert.equal(calculator.calculate().result, 1750);
});

test('incomplete expressions preview the preceding value and error only on commit', () => {
  const calculator = new Calculator();
  enter(calculator, '8', '+');
  assert.equal(calculator.preview, 8);
  assert.equal(calculator.error, null);
  assert.equal(calculator.calculate(), null);
  assert.ok(calculator.error);
});

test('input is bounded', () => {
  const calculator = new Calculator();
  calculator.setExpression('1'.repeat(600));
  assert.equal(calculator.expression.length, 512);
  calculator.input('2');
  assert.equal(calculator.expression.length, 512);
});
