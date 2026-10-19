import { evaluateExpression } from './engine.js';

/** UI-independent state, shared by click, touch, keyboard, and direct entry. */
export class Calculator {
  constructor() {
    this.expression = '';
    this.angleMode = 'deg';
    this.evaluated = false;
    this.error = null;
    this.lastResult = 0;
  }

  get completedExpression() {
    const opens = [...this.expression].filter(char => char === '(').length;
    const closes = [...this.expression].filter(char => char === ')').length;
    return this.expression + ')'.repeat(Math.max(0, opens - closes));
  }

  get preview() {
    if (!this.expression) return 0;
    try {
      return evaluateExpression(this.completedExpression, { angleMode: this.angleMode });
    } catch {
      // Keep the current operand visible while the next one is being entered.
      try {
        const partial = this.completedExpression.replace(/[+\-*/^]+$/, '');
        return evaluateExpression(partial, { angleMode: this.angleMode });
      } catch {
        return null;
      }
    }
  }

  setExpression(value) {
    this.expression = value.slice(0, 512).replace(/×/g, '*').replace(/[÷]/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/,/g, '');
    this.evaluated = false;
    this.error = null;
  }

  input(value) {
    if (this.expression.length + value.length > 512) return;
    this.error = null;
    const isOperator = /^[+\-*/^]$/.test(value);
    if (this.evaluated) {
      this.expression = isOperator || value === '%' ? String(this.lastResult) : '';
      this.evaluated = false;
    }
    if (isOperator) {
      if (!this.expression && value !== '-') return;
      if (/[+\-*/^]$/.test(this.expression)) {
        if (value === '-' && !this.expression.endsWith('-')) this.expression += '-';
        else this.expression = this.expression.replace(/[+\-*/^]+$/, '') + value;
        return;
      }
    }
    if (value === '.') {
      const number = this.expression.match(/(?:\d*\.?\d*)$/)?.[0] || '';
      if (number.includes('.')) return;
      if (!number) value = '0.';
    }
    if (/^\d$/.test(value) && /(^|[+\-*/^(])0$/.test(this.expression)) {
      this.expression = this.expression.slice(0, -1);
    }
    if (/^(\d|\.)/.test(value) && this.expression.endsWith('%')) this.expression += '*';
    this.expression += value;
  }

  clear() {
    this.expression = '';
    this.evaluated = false;
    this.error = null;
    this.lastResult = 0;
  }

  backspace() {
    if (this.evaluated) this.expression = String(this.lastResult);
    this.expression = this.expression.replace(/[a-z]+\($|.$/i, '');
    this.evaluated = false;
    this.error = null;
  }

  toggleSign() {
    if (this.evaluated) this.expression = String(this.lastResult);
    this.evaluated = false;
    this.error = null;
    if (!this.expression || /[+\-*/^(]$/.test(this.expression)) {
      this.expression += '-';
      return;
    }
    let start = this.expression.length - 1;
    if (this.expression[start] === ')') {
      let depth = 1;
      while (start > 0 && depth) {
        start -= 1;
        if (this.expression[start] === ')') depth += 1;
        if (this.expression[start] === '(') depth -= 1;
      }
      while (start > 0 && /[a-z]/i.test(this.expression[start - 1])) start -= 1;
    } else {
      const match = this.expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?%?$|(?:pi|e)%?$/i);
      if (!match) return;
      start = match.index;
    }
    const operand = this.expression.slice(start);
    const negated = operand.startsWith('(-') && operand.endsWith(')')
      ? operand.slice(2, -1) : `(-${operand})`;
    this.expression = this.expression.slice(0, start) + negated;
  }

  calculate() {
    if (!this.expression || this.evaluated) return null;
    try {
      const expression = this.completedExpression;
      const result = evaluateExpression(expression, { angleMode: this.angleMode });
      this.lastResult = result;
      this.expression = expression;
      this.evaluated = true;
      this.error = null;
      return { expression, result, angleMode: this.angleMode, timestamp: Date.now() };
    } catch (error) {
      this.error = error.message;
      return null;
    }
  }
}
