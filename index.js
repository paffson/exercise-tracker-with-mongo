const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
let bodyParser = require('body-parser')

let mongoose = require('mongoose')
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Database connection successful');
  })
  .catch((err) => {
    console.error('Database connection error ' + err);
  });


app.use(cors())
app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: false }))

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// Schemas
const userSchema = new mongoose.Schema({
  username: String
});
const exerciseSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Models
const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Middleware to handle fetching all users
function fetchAllUsers(req, res, next) {
  User.find({})
    .then((users) => {
      res.locals.users = users;
      next();
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
}

// Middleware to handle adding a new user
function addUser(req, res, next) {
  const newUser = new User({ username: req.body.username });

  newUser.save()
    .then((user) => {
      res.locals.user = user;
      next();
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Failed to add user' });
    });
}

// Middleware to add a new exercise to the user
function addExercise(req, res, next) {
  const { _id } = req.params;
  const { description, duration, date } = req.body;

  // Check if the provided _id is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Create a new exercise and assign the user ID
  const newExercise = new Exercise({
    description,
    duration,
    // Only assign the date property if it exists in the request body
    ...(date && { date }),
    user: _id
  });

  // Save the new exercise in the database
  newExercise.save()
    .then((exercise) => {
      res.locals.exercise = exercise //.toObject()
      // Find the user by _id
      return User.findById(_id).exec();
    })
    .then((user) => {
      res.locals.user = user.toObject()
      next()
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Failed to add exercise' });
    });
}

// Middleware to fetch user and populate exercises
function fetchUserAndPopulateExercises(req, res, next) {
  const { _id } = req.params;
  const { from, to, limit } = req.query;

  // Check if the provided _id is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

    // Find the user by _id
  User.findById(_id)
    .exec()
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const { limit, from, to } = req.query;
      const limitValue = limit && !isNaN(limit) && parseInt(limit) > 0 ? parseInt(limit) : 0;
    
      const convertToDate = (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
    
        // Validate the date components
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          return null; // Invalid date format
        }
    
        // Construct the Date object
        const dateObject = new Date(year, month - 1, day); // Note: Months in JavaScript Date are zero-based (0 - 11)
    
        // Validate the Date object
        if (isNaN(dateObject.getTime())) {
          return null; // Invalid date
        }
    
        return dateObject;
      };

      // Create the base Mongoose query with the user filter
      const query = Exercise.find({ user: _id });
    
      // Apply date filtering if 'from' and/or 'to' date parameters are provided
      if (from) {
        const fromDate = convertToDate(from);
        if (fromDate !== null) {
          query.where('date').gte(fromDate);
        } else {
          return res.status(400).json({ error: 'Invalid "from" date format' });
        }
      }
    
      if (to) {
        const toDate = convertToDate(to);
        if (toDate !== null) {
          query.where('date').lte(toDate);
        } else {
          return res.status(400).json({ error: 'Invalid "to" date format' });
        }
      }
        
      if (limitValue > 0) {
        query.limit(limitValue);
      }

      // Find all exercises for the user
      return query
        .exec()
        .then((exercises) => {
        // Create an array with only the desired fields (date, description, duration)
        const log = exercises.map(({ date, description, duration }) => ({
          date: date.toDateString(),
          description,
          duration
        }));

        // Add the user object with the modified log array to res.locals
        res.locals.user = user;
        res.locals.log = log;

        next(); // Move to the next middleware or route handler
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch user logs' });
    });
}

app.route('/api/users/:_id/logs')
  .get(fetchUserAndPopulateExercises, (req, res) => {
  const user = res.locals.user;
  const log = res.locals.log;

  res.json({
    _id: user._id,
    username: user.username,
    log,
    count: log.length
  });
});

app.route('/api/users')
  .get(fetchAllUsers, (req, res) => {
    const users = res.locals.users;
    res.json(users);
  })
  .post(addUser, (req, res) => {
    const user = res.locals.user;
    res.json(user);
  });

app.route('/api/users/:_id/exercises')
  .post(addExercise, (req, res) => {
    const { __v, ...user } = res.locals.user; //spread shouldn't really be used with custom objects, leaving as a working example with toObject called on it previously.
    const { description, duration, date } = res.locals.exercise;
    const responseObj = {
      ...user, 
      description,
      duration,
      date: date.toDateString(),
    };

    res.json(responseObj);
  })


const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
