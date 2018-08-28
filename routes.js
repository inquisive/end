module.exports = function(app) {
    const controller = require('./routeController.js');
    
    app.route('/schedule/:day')
      .get(controller.schedule)

    app.route('/pushData/')
      .get(controller.pushData)
    
    
    app.route('/gameFeed/:gamepk')
      .get(controller.feed)
      //.put(todoList.update_a_task)
      //.delete(todoList.delete_a_task);
  };