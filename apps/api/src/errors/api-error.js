class ApiError extends Error {
  constructor(message, { statusCode, code, type } = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
  }
}

module.exports = {
  ApiError,
};
