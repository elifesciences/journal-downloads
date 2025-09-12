if (process.env.NODE_ENV === 'test') {
  // silence console log output during tests
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}
