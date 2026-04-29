let io;

module.exports = {
  init: (httpServer) => {
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST']
      }
    });

    io.on('connection', (socket) => {
      // Room personnelle pour les notifications temps réel
      socket.on('join:user', (userId) => {
        socket.join(`user:${userId}`);
      });

      // Le client rejoint la room d'un service spécifique
      socket.on('join:service', (serviceId) => {
        socket.join(`service:${serviceId}`);
      });

      socket.on('leave:service', (serviceId) => {
        socket.leave(`service:${serviceId}`);
      });

      // Le citoyen suit son ticket spécifique
      socket.on('join:ticket', (ticketId) => {
        socket.join(`ticket:${ticketId}`);
      });

      socket.on('leave:ticket', (ticketId) => {
        socket.leave(`ticket:${ticketId}`);
      });
    });

    return io;
  },

  // Émettre une mise à jour de la file vers tous les clients de ce service
  emitQueueUpdate: (serviceId, stats) => {
    if (io) {
      io.to(`service:${serviceId}`).emit('queue:update', stats);
    }
  },

  // Notifier le citoyen que son ticket a été appelé
  emitTicketCalled: (ticketId, data) => {
    if (io) {
      io.to(`ticket:${ticketId}`).emit('ticket:called', data);
    }
  },

  // Notifier le citoyen que son ticket a avancé en file
  emitTicketUpdate: (ticketId, data) => {
    if (io) {
      io.to(`ticket:${ticketId}`).emit('ticket:update', data);
    }
  },

  getIO: () => io
};
