const MongoClient = require('mongodb').MongoClient

const db = require('monk')('localhost:27017/data')
const urlHashCount = db.get('urlHashCount')
if(urlHashCount){
  console.log('its there')
  urlHashCount.insert({
    test: 'hi!!!!'
  })

  urlHashCount.find({},{}).then((docs) =>{
    console.log(docs)
    db.close()
  } )
}


// let url = 'mongodb://localhost:27017/url-hash-count'
// // Use connect method to connect to the Server
// MongoClient.connect(url)
//   .then(db => {
//     console.log("Connected correctly to server")
//     db.close()
//   })
//   .catch(err => {
//     console.error(err)
//   })