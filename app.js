const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const tweetsToResponseTweets = (eachArray) => {
  return {
    username: eachArray.name,
    tweet: eachArray.tweet,
    dateTime: eachArray.date_time,
  };
};

const fromObjectToResponseLikeObject = (dbObject) => {
  return {
    //likes
    likes: dbObject.username,
  };
};

const fromObjectToResponseReplyObject = (dbObject) => {
  //replies:
  return {
    name: dbObject.username,
    reply: dbObject.reply,
  };
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  if (password.length < 6) {
    response.send("Password is too short");
    response.status(400);
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUsernameQuery = `
    SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(getUsernameQuery);
  if (dbUser === undefined) {
    const addNewuserQuery = `
        INSERT INTO user (username,password,name,gender)
        VALUES(
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        );`;
    await db.run(addNewuserQuery);
    response.status(200);
    response.send("User created successfully");
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

///
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "suneelSahu");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid1 JWT Token");
  } else {
    jwt.verify(jwtToken, "suneelSahu", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid2 JWT Token");
      } else {
        next();
      }
    });
  }
};

///API3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
    SELECT tweet.tweet,tweet.date_time,user.name
    FROM (follower INNER JOIN tweet ON follower.follower_user_id = tweet.user_id)
    AS T INNER JOIN user ON T.user_id = user.user_id
    LIMIT 4
    OFFSET 0;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(
    tweetsArray.map((eachTweet) => tweetsToResponseTweets(eachTweet))
  );
});

///API4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getFollowingQuery = `
  SELECT user.name
  FROM user INNER JOIN follower ON follower.follower_user_id=user.user_id;`;
  const followingArray = await db.all(getFollowingQuery);
  response.send(followingArray);
});

///API5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getFollowersQuery = `
  SELECT user.name
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id;`;
  const followersArray = await db.all(getFollowersQuery);
  response.send(followersArray);
});

///API6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getFollowersQuery = `
  SELECT tweet.tweet as tweet,
  COUNT(like.like_id) as likes,
  COUNT(reply.reply_id) as replies,
  tweet.date_time as dateTime
  FROM ((tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS T LEFT JOIN reply ON T.tweet_id = reply.tweet_id ) AS P LEFT JOIN follower ON P.user_id = follower.following_user_id
  WHERE tweet.tweet_id = ${tweetId};`;
  const followerTweets = await db.all(getFollowersQuery);
  if (followerTweets === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(followerTweets);
  }
});

///API7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
    SELECT DISTINCT(user.username)
    FROM (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) 
    AS T LEFT JOIN user ON like.user_id = user.user_id
    WHERE tweet.tweet_id =${tweetId};
    `;
    const userLikes = await db.all(getLikesQuery);
    if (userLikes === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(
        userLikes.map((eachLike) => fromObjectToResponseLikeObject(eachLike))
      );
    }
  }
);

///API8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplyQuery = `
    SELECT *
    FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS T LEFT JOIN reply ON T.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId}`;
    const repliesToTweet = await db.all(getReplyQuery);
    if (repliesToTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(
        repliesToTweet.map((eachReply) =>
          fromObjectToResponseReplyObject(eachReply)
        )
      );
    }
  }
);

///API9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const getFollowersQuery = `
  SELECT tweet.tweet as tweet,
  COUNT(like.like_id) as likes,
  COUNT(reply.reply_id) as replies,
  tweet.date_time as dateTime
  FROM ((tweet INNER JOIN user ON tweet.user_id = user.user_id) 
  AS T LEFT JOIN reply ON T.user_id = reply.user_id) 
  AS P LEFT JOIN like ON P.user_id=like.user_id;`;
  const tweetsArray = await db.all(getFollowersQuery);
  response.send(tweetsArray);
});

///API10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createNewTweetQuery = `
  INSERT INTO tweet(tweet)
  VALUES('${tweet}');`;
  await db.run(createNewTweetQuery);
  response.send("Created a Tweet");
});

///API11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deletingTweetQuery = `
    DELETE FROM 
        (tweet INNER JOIN user ON tweet.user_id = user.user_id) AS T
    WHERE
        T.tweet_id = ${tweetId};`;
    const dbResponse = await db.run(deletingTweetQuery);
    if (dbResponse.lastId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
