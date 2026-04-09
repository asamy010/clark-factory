import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

/* Lock to portrait on mobile */
try{screen.orientation?.lock?.("portrait").catch(()=>{})}catch(e){}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
