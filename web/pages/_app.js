import React from 'react';

// This default App component simply renders the page component.  You can add global state or styles here.
export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
