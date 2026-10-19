const MAX_EXPRESSION_LENGTH = 4096;
const MAX_NESTING = 64;
const DISPLAY_PRECISION = 12;

const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const FUNCTION_NAMES = new Set(['sin', 'cos', 'tan', 'sqrt', 'log', 'ln', 'abs']);
const DECIMAL_FORMAT = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  maximumSignificantDigits: DISPLAY_PRECISION,
});

function isDigit(character) {
  return character >= '0' && character <= '9';
}

function isLetter(character) {
  return character >= 'a' && character <= 'z';
}

function finiteResult(value) {
  if (Number.isNaN(value)) {
    throw new Error('Result is not a real number.');
  }
  if (!Number.isFinite(value)) {
    throw new Error('Result is too large.');
  }
  return value;
}

function tokenize(expression) {
  const source = expression.toLowerCase();
  const tokens = [];
  let position = 0;

  while (position < source.length) {
    const character = source[position];

    if (/\s/.test(character)) {
      position += 1;
      continue;
    }

    if (isDigit(character) || character === '.') {
      const start = position;
      let digitCount = 0;

      while (isDigit(source[position])) {
        position += 1;
        digitCount += 1;
      }
      if (source[position] === '.') {
        position += 1;
        while (isDigit(source[position])) {
          position += 1;
          digitCount += 1;
        }
      }
      if (digitCount === 0) {
        throw new Error('Enter a valid number.');
      }

      // An e followed by exponent digits belongs to the number. Otherwise it
      // remains Euler's constant, so both 2e and 2e3 have useful meanings.
      if (source[position] === 'e') {
        let exponentEnd = position + 1;
        const hasSign = source[exponentEnd] === '+' || source[exponentEnd] === '-';
        if (hasSign) exponentEnd += 1;
        const exponentStart = exponentEnd;
        while (isDigit(source[exponentEnd])) exponentEnd += 1;

        if (exponentEnd > exponentStart) {
          position = exponentEnd;
        }
      }

      const value = Number(source.slice(start, position));
      if (!Number.isFinite(value)) throw new Error('Number is too large.');
      tokens.push({ type: 'number', value });
      continue;
    }

    if (isLetter(character)) {
      const start = position;
      while (isLetter(source[position])) position += 1;
      const name = source.slice(start, position);

      if (Object.hasOwn(CONSTANTS, name)) {
        tokens.push({ type: 'constant', value: CONSTANTS[name] });
      } else if (FUNCTION_NAMES.has(name)) {
        tokens.push({ type: 'function', name });
      } else {
        throw new Error('Unknown function or constant.');
      }
      continue;
    }

    if ('+-*/^%()'.includes(character)) {
      tokens.push({ type: character });
      position += 1;
      continue;
    }

    throw new Error('Invalid character in expression.');
  }

  tokens.push({ type: 'end' });
  return tokens;
}

function trigonometry(name, value, angleMode) {
  const fullTurn = angleMode === 'deg' ? 360 : 2 * Math.PI;
  const quarterTurns = (value % fullTurn) / (fullTurn / 4);

  // Exact cardinal angles should produce exact zeros, not visible round-off.
  // This deliberately does not round arbitrary small angles down to zero.
  if (Number.isInteger(quarterTurns)) {
    const index = ((quarterTurns % 4) + 4) % 4;
    const sine = [0, 1, 0, -1][index];
    const cosine = [1, 0, -1, 0][index];
    if (name === 'sin') return sine;
    if (name === 'cos') return cosine;
    if (cosine === 0) throw new Error('Tangent is undefined at this angle.');
    return 0;
  }

  // Reduce degree inputs before conversion; use native range reduction for
  // radians so large radian arguments retain Math's numerical accuracy.
  const radians = angleMode === 'deg' ? (value % 360) * (Math.PI / 180) : value;
  if (name === 'sin') return Math.sin(radians);
  if (name === 'cos') return Math.cos(radians);
  return Math.tan(radians);
}

function applyFunction(name, value, angleMode) {
  switch (name) {
    case 'sin':
    case 'cos':
    case 'tan':
      return finiteResult(trigonometry(name, value, angleMode));
    case 'sqrt':
      if (value < 0) throw new Error('Square root requires a non-negative number.');
      return Math.sqrt(value);
    case 'log':
    case 'ln':
      if (value <= 0) throw new Error('Logarithm requires a positive number.');
      return name === 'log' ? Math.log10(value) : Math.log(value);
    case 'abs':
      return Math.abs(value);
    default:
      throw new Error('Unknown function or constant.');
  }
}

class Parser {
  constructor(tokens, angleMode) {
    this.tokens = tokens;
    this.angleMode = angleMode;
    this.position = 0;
  }

  peek() {
    return this.tokens[this.position];
  }

  parse() {
    const value = this.parseExpression(0);
    if (this.peek().type === ')') throw new Error('Check the parentheses.');
    if (this.peek().type !== 'end') throw new Error('Add an operator between values.');
    return value === 0 ? 0 : value;
  }

  parseExpression(depth) {
    let value = this.parseProduct(depth);
    while (this.peek().type === '+' || this.peek().type === '-') {
      const operator = this.tokens[this.position++].type;
      const right = this.parseProduct(depth);
      value = finiteResult(operator === '+' ? value + right : value - right);
    }
    return value;
  }

  parseProduct(depth) {
    let value = this.parseUnary(depth);
    while (true) {
      const next = this.peek().type;
      const previous = this.tokens[this.position - 1].type;
      const explicit = next === '*' || next === '/';
      const implicit = next === 'constant' || next === 'function' || next === '('
        || (next === 'number' && (previous === 'constant' || previous === ')'));
      if (!explicit && !implicit) break;
      if (explicit) this.position += 1;

      const right = this.parseUnary(depth);
      if (next === '/' && right === 0) throw new Error('Cannot divide by zero.');
      value = finiteResult(next === '/' ? value / right : value * right);
    }
    return value;
  }

  parseUnary(depth) {
    // Count all recursive constructs, including signs and power chains, rather
    // than only parentheses. Flat sums/products remain iterative.
    if (depth > MAX_NESTING) throw new Error('Expression is too deeply nested.');
    const next = this.peek().type;
    if (next === '+' || next === '-') {
      this.position += 1;
      const value = this.parseUnary(depth + 1);
      return next === '-' ? -value : value;
    }
    return this.parsePower(depth);
  }

  parsePower(depth) {
    let value = this.parsePostfix(depth);
    if (this.peek().type === '^') {
      this.position += 1;
      // A unary right operand permits 2^-3 and makes powers right-associative.
      const exponent = this.parseUnary(depth + 1);
      if (value === 0 && exponent < 0) throw new Error('Cannot divide by zero.');
      value = finiteResult(Math.pow(value, exponent));
    }
    return value;
  }

  parsePostfix(depth) {
    let value = this.parsePrimary(depth);
    while (this.peek().type === '%') {
      this.position += 1;
      value /= 100;
    }
    return value;
  }

  parsePrimary(depth) {
    const token = this.peek();
    if (token.type === 'number' || token.type === 'constant') {
      this.position += 1;
      return token.value;
    }
    if (token.type === '(') return this.parseGroup(depth);
    if (token.type === 'function') {
      this.position += 1;
      if (this.peek().type !== '(') throw new Error('Use parentheses after functions.');
      return applyFunction(token.name, this.parseGroup(depth), this.angleMode);
    }
    if (token.type === 'end') throw new Error('Complete the expression.');
    throw new Error('Expected a number or function.');
  }

  parseGroup(depth) {
    this.position += 1;
    if (this.peek().type === ')') throw new Error('Enter a value inside parentheses.');
    const value = this.parseExpression(depth + 1);
    if (this.peek().type !== ')') throw new Error('Missing closing parenthesis.');
    this.position += 1;
    return value;
  }
}

/**
 * Evaluate calculator syntax without executing JavaScript.
 *
 * Precedence (high to low): postfix %, right-associative ^, unary signs,
 * multiplication/division (including implicit multiplication), addition/subtraction.
 * Functions require parentheses. Names are case-insensitive. Percent always means
 * division by 100; log is base 10 and ln is natural logarithm. 0^0 is 1.
 * Numeric exponents take priority over implicit e: 2e3 = 2000; 2e = 2 * e.
 * At most 4096 source characters and 64 nested groups/signs/powers are accepted.
 * Invalid syntax, non-real results, division by zero, and overflow throw Error.
 */
export function evaluateExpression(expression, options = { angleMode: 'deg' }) {
  if (typeof expression !== 'string') throw new Error('Enter a valid expression.');
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression is too long.');
  if (expression.trim() === '') throw new Error('Enter an expression.');
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Invalid calculator options.');
  }
  const angleMode = options.angleMode === undefined ? 'deg' : options.angleMode;
  if (angleMode !== 'deg' && angleMode !== 'rad') {
    throw new Error('Use degrees or radians.');
  }
  return new Parser(tokenize(expression), angleMode).parse();
}

/**
 * Format finite numbers with deterministic English grouping and up to 12
 * significant digits. Use scientific notation below 1e-9 or from 1e15, after
 * rounding. Small nonzero values remain nonzero; negative zero displays as 0.
 * Formatting never rounds intermediate evaluation results.
 */
export function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Cannot format a non-finite number.');
  }
  if (value === 0) return '0';

  const rounded = Number(value.toPrecision(DISPLAY_PRECISION));
  const magnitude = Math.abs(rounded);
  if (magnitude >= 1e15 || magnitude < 1e-9) {
    // Format the original value: a rounded Number.MAX_VALUE would be Infinity.
    const [coefficient, exponent] = value.toExponential(DISPLAY_PRECISION - 1).split('e');
    const trimmed = coefficient.replace(/0+$/, '').replace(/\.$/, '');
    return `${trimmed}e${exponent}`;
  }
  return DECIMAL_FORMAT.format(rounded);
}
